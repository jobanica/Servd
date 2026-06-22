"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { getRestaurantGateway } from "./credentials";

const schema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
  // Optional gratuity (centavos) the diner chose to add at checkout.
  tipCentavos: z.coerce.number().int().min(0).max(10_000_000).optional(),
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
  tipCentavos?: number;
}): Promise<{ ok: boolean; checkoutUrl?: string; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug: parsed.data.slug, status: "active" },
      select: { id: true, name: true, displayName: true, feedbackMode: true, paymentGateway: true },
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
      select: { id: true, total: true, discountAmount: true, creditApplied: true },
    }),
  );
  if (orders.length === 0) return { ok: false, error: "Nothing to pay right now." };

  // Charge the net amount (gross − any discount AND any redeemed gift-card credit
  // applied at the bill). Never trust a client-supplied total.
  const net = (o: { total: number; discountAmount: number; creditApplied?: number }) =>
    Math.max(0, o.total - (o.discountAmount ?? 0) - (o.creditApplied ?? 0));

  // Optional tip, clamped server-side to a sane cap (≤ the bill, min ₱500 floor
  // for tiny bills). Distributed across the orders proportionally to their net.
  const tableNet = orders.reduce((s, o) => s + net(o), 0);
  const tipCap = Math.max(tableNet, 50_000); // allow up to 100% of the bill (or ₱500)
  const tip = Math.min(Math.max(0, Math.round(parsed.data.tipCentavos ?? 0)), tipCap);
  const tipByOrder = new Map<string, number>();
  let allocated = 0;
  orders.forEach((o, idx) => {
    const share =
      idx === orders.length - 1
        ? tip - allocated
        : tableNet > 0
          ? Math.round((tip * net(o)) / tableNet)
          : 0;
    tipByOrder.set(o.id, Math.max(0, share));
    allocated += Math.max(0, share);
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const orderPath = `${base}/order/${parsed.data.slug}/${parsed.data.tableToken}`;
  // After paying online, thank the diner and ask for feedback.
  const successUrl = `${orderPath}/feedback?paid=1`;

  let checkout;
  try {
    checkout = await gateway.createCheckout({
      lineItems: [
        ...orders.map((o, i) => ({
          name: `${ctx.restaurant.displayName || ctx.restaurant.name} · Table ${ctx.table.tableNumber} · Order ${i + 1}`,
          amount: net(o),
          quantity: 1,
        })),
        ...(tip > 0 ? [{ name: "Tip / gratuity", amount: tip, quantity: 1 }] : []),
      ],
      referenceNumber: parsed.data.tableToken.slice(0, 12),
      successUrl,
      methods: ["gcash", "card"],
    });
  } catch (e) {
    console.error("createTableCheckout: gateway error", e);
    const detail = e instanceof Error ? e.message : "";
    return {
      ok: false,
      error: detail ? `Couldn't start checkout: ${detail}` : "Couldn't start checkout. Please try again.",
    };
  }

  // Record a pending payment per order (incl. its tip share), all keyed to this
  // checkout session, and store the tip on the order for reporting.
  await tenantDb(ctx.restaurant.id, async (tx) => {
    await tx.payment.createMany({
      data: orders.map((o) => ({
        orderId: o.id,
        amount: net(o) + (tipByOrder.get(o.id) ?? 0),
        method: "online_gcash", // refined to actual method on webhook if available
        gateway: ctx.restaurant.paymentGateway ?? "paymongo",
        gatewayRef: checkout!.gatewayRef,
        status: "pending",
      })),
    });
    for (const o of orders) {
      await tx.order.update({
        where: { id: o.id },
        data: { paymentStatus: "pending", tipAmount: tipByOrder.get(o.id) ?? 0 },
      });
    }
  });

  return { ok: true, checkoutUrl: checkout.checkoutUrl };
}
