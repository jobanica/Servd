"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { getRestaurantGateway } from "./credentials";

const schema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
});

/**
 * Diner pays online AFTER eating: creates one hosted checkout for the table's
 * outstanding orders, records a pending Payment per order (all sharing the
 * checkout id), and returns the URL to redirect to. The order is only marked
 * paid later, by the signature-verified webhook — never here, never the client.
 */
export async function createTableCheckout(input: {
  slug: string;
  tableToken: string;
}): Promise<{ ok: boolean; checkoutUrl?: string; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug: parsed.data.slug, status: "active" },
      select: { id: true, name: true, displayName: true, feedbackMode: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: parsed.data.tableToken },
      select: { id: true, tableNumber: true },
    });
    if (!table) return null;
    return { restaurant, table };
  });
  if (!ctx) return { ok: false, error: "Table unavailable." };

  const gateway = await getRestaurantGateway(ctx.restaurant.id);
  if (!gateway) return { ok: false, error: "Online payment isn't available here." };

  // Outstanding (unpaid) open orders at this table.
  const orders = await tenantDb(ctx.restaurant.id, (tx) =>
    tx.order.findMany({
      where: {
        tableId: ctx.table.id,
        status: { in: ["new", "preparing", "done"] },
        paymentStatus: { in: ["unpaid", "failed"] },
      },
      select: { id: true, total: true },
    }),
  );
  if (orders.length === 0) return { ok: false, error: "Nothing to pay right now." };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const orderPath = `${base}/order/${parsed.data.slug}/${parsed.data.tableToken}`;
  // After paying online, thank the diner and ask for feedback.
  const successUrl = `${orderPath}/feedback?paid=1`;

  let checkout;
  try {
    checkout = await gateway.createCheckout({
      lineItems: orders.map((o, i) => ({
        name: `${ctx.restaurant.displayName || ctx.restaurant.name} · Table ${ctx.table.tableNumber} · Order ${i + 1}`,
        amount: o.total,
        quantity: 1,
      })),
      referenceNumber: parsed.data.tableToken.slice(0, 12),
      successUrl,
      methods: ["gcash", "card"],
    });
  } catch {
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }

  // Record a pending payment per order, all keyed to this checkout session.
  await tenantDb(ctx.restaurant.id, (tx) =>
    tx.payment.createMany({
      data: orders.map((o) => ({
        orderId: o.id,
        amount: o.total,
        method: "online_gcash", // refined to actual method on webhook if available
        gateway: "paymongo",
        gatewayRef: checkout!.gatewayRef,
        status: "pending",
      })),
    }),
  );
  await tenantDb(ctx.restaurant.id, (tx) =>
    tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { paymentStatus: "pending" },
    }),
  );

  return { ok: true, checkoutUrl: checkout.checkoutUrl };
}
