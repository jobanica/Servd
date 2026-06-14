import { tenantDb } from "@/server/tenancy/scoped-db";
import { buildTicket, type Ticket } from "@/lib/printing/ticket";

/** Loads an order and shapes it into a Ticket (tenant-scoped). */
export async function getOrderTicket(
  restaurantId: string,
  orderId: string,
): Promise<Ticket | null> {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: { name: true, displayName: true },
    });
    const order = await tx.order.findFirst({
      where: { id: orderId },
      include: {
        table: { select: { tableNumber: true } },
        items: { include: { modifiers: { select: { nameAtTime: true } } } },
      },
    });
    if (!order) return null;
    return buildTicket({
      restaurantName: restaurant.displayName || restaurant.name,
      tableNumber: order.table?.tableNumber ?? "—",
      orderId: order.id,
      createdAt: order.createdAt.toISOString(),
      total: order.total,
      items: order.items.map((i) => ({
        quantity: i.quantity,
        name: i.nameAtTime,
        modifiers: i.modifiers.map((m) => m.nameAtTime),
        note: i.note,
      })),
    });
  });
}
