"use server";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Public order-status lookup for the diner's live tracker. Diners have no
 * session — access is authorized by the table token + the order id together
 * (both are needed, and the order must belong to that restaurant + table).
 */
export interface OrderStatusResult {
  status: string; // pending | new | preparing | done | closed | cancelled
  paymentStatus: string;
}

export async function getOrderStatus(
  slug: string,
  tableToken: string,
  orderId: string,
): Promise<OrderStatusResult | null> {
  if (!slug || !tableToken || !orderId) return null;
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true },
    });
    if (!table) return null;
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId: restaurant.id, tableId: table.id },
      select: { status: true, paymentStatus: true },
    });
    return order ? { status: order.status, paymentStatus: order.paymentStatus } : null;
  });
}
