"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";

export type CancelResult = { ok: true } | { ok: false; error: string };

/**
 * Lets the customer cancel their OWN online order — but only while it's still
 * pending (not yet accepted by the restaurant). Authorized by slug + orderId
 * (the unguessable UUID). Once accepted, the update matches no rows and we tell
 * them it can't be cancelled anymore.
 */
export async function cancelWebOrder(slug: string, orderId: string): Promise<CancelResult> {
  if (!slug || !orderId) return { ok: false, error: "Order not found." };
  const restaurant = await systemDb((tx) => tx.restaurant.findFirst({ where: { slug }, select: { id: true } }));
  if (!restaurant) return { ok: false, error: "Order not found." };

  const res = await systemDb((tx) =>
    tx.order.updateMany({
      where: { id: orderId, restaurantId: restaurant.id, status: "pending" },
      data: { status: "cancelled", cancelReason: "Cancelled by customer" },
    }),
  );
  if (res.count === 0) {
    return { ok: false, error: "This order was already accepted and can no longer be cancelled." };
  }
  await notifyOrdersChanged(restaurant.id);
  return { ok: true };
}

/**
 * Public order-status lookup for an ONLINE (web storefront) order. The customer
 * has no session and no table token — access is authorized by the restaurant
 * slug + the order id together. The order id is an unguessable UUID and the
 * order must belong to that restaurant, so this is safe to expose publicly.
 *
 * Mirrors getOrderStatus (the table-diner tracker) but keyed by slug + orderId
 * instead of a table token, and also surfaces the delivery sub-status so the
 * customer sees "Out for delivery" / "Delivered".
 */
export interface WebOrderStatusResult {
  restaurantId: string; // so the client can subscribe to the realtime channel
  status: string; // pending | new | preparing | done | closed | cancelled
  paymentStatus: string;
  deliveryStatus: string | null; // null | out_for_delivery | delivered
  orderType: string; // takeout | delivery (online orders)
  total: number; // centavos
  orderNumber: number | null; // daily ticket number, if any
  prepMinutes: number | null; // ETA the merchant set on accept, if any
}

export async function getWebOrderStatus(
  slug: string,
  orderId: string,
): Promise<WebOrderStatusResult | null> {
  if (!slug || !orderId) return null;
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!restaurant) return null;

    // Core fields always exist; the order must belong to this restaurant.
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id },
      select: { status: true, paymentStatus: true, total: true },
    });
    if (!order) return null;

    // orderType / deliveryStatus / prepMinutes columns may lag on prod — read
    // them best-effort so the tracker never breaks before a migration runs.
    let orderType = "takeout";
    let deliveryStatus: string | null = null;
    try {
      const extra = await tx.order.findFirst({
        where: { id: orderId },
        select: { orderType: true, deliveryStatus: true },
      });
      orderType = extra?.orderType ?? "takeout";
      deliveryStatus = extra?.deliveryStatus ?? null;
    } catch {
      /* columns not migrated yet */
    }

    let prepMinutes: number | null = null;
    try {
      const p = await tx.order.findFirst({ where: { id: orderId }, select: { prepMinutes: true } });
      prepMinutes = p?.prepMinutes ?? null;
    } catch {
      /* prepMinutes not migrated yet */
    }

    let orderNumber: number | null = null;
    try {
      const n = await tx.order.findFirst({ where: { id: orderId }, select: { orderNumber: true } });
      orderNumber = n?.orderNumber ?? null;
    } catch {
      /* column not migrated yet */
    }

    return {
      restaurantId: restaurant.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryStatus,
      orderType,
      total: order.total,
      orderNumber,
      prepMinutes,
    };
  });
}
