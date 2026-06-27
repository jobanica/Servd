"use server";

import { systemDb } from "@/server/tenancy/scoped-db";

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

    // orderType / deliveryStatus / orderNumber columns may lag on prod — read
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
    };
  });
}
