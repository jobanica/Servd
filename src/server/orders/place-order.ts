"use server";

import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import {
  placeOrderSchema,
  type PlaceOrderInput,
  type PlaceOrderResult,
} from "@/lib/validation/order";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
} from "@/server/orders/build-order";

/**
 * Creates an order from a diner's cart. Diners have no session — the order is
 * authorized purely by the table token in the URL.
 *
 * The order is created as `pending`: it does NOT go to the kitchen until a
 * cashier accepts it (the cashier sees an incoming-order popup). Pricing and
 * validation are recomputed server-side via buildValidatedOrder — the client is
 * never trusted for money.
 */
export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  }
  const { slug, tableToken, lines } = parsed.data;

  // Resolve the restaurant + table (public lookups, scoped by slug/token).
  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug, status: "active" },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true },
    });
    if (!table) return null;
    return { restaurantId: restaurant.id, tableId: table.id };
  });
  if (!ctx) return { ok: false, error: "This table or restaurant is unavailable." };

  let built;
  try {
    built = await buildValidatedOrder(ctx.restaurantId, lines);
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "We couldn't place your order. Please try again." };
  }

  // Persist atomically, tenant-scoped (RLS WITH CHECK enforces the boundary).
  const order = await tenantDb(ctx.restaurantId, (tx) =>
    tx.order.create({
      data: {
        restaurantId: ctx.restaurantId,
        tableId: ctx.tableId,
        status: "pending", // awaiting cashier acceptance
        paymentStatus: "unpaid",
        total: built.total,
        items: { create: orderItemsCreate(built.items) },
      },
      select: { id: true },
    }),
  );

  // Alert the live cashier screen (the kitchen ticket prints on acceptance).
  await notifyOrdersChanged(ctx.restaurantId);

  return { ok: true, orderId: order.id };
}
