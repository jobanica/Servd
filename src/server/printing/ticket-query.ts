import { tenantDb } from "@/server/tenancy/scoped-db";
import { buildTicket, type Ticket } from "@/lib/printing/ticket";

/** Loads an order and shapes it into a Ticket (tenant-scoped). */
export async function getOrderTicket(
  restaurantId: string,
  orderId: string,
): Promise<Ticket | null> {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: { name: true, displayName: true, printerConfig: true },
    });
    const receipt =
      ((restaurant.printerConfig as { receipt?: Record<string, string | null> } | null)?.receipt) ??
      {};
    const order = await tx.order.findFirst({
      where: { id: orderId },
      // Explicit select (no SELECT *) so a lagging schema can't break printing.
      select: {
        id: true,
        total: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
        items: {
          select: {
            quantity: true,
            nameAtTime: true,
            note: true,
            modifiers: { select: { nameAtTime: true } },
          },
        },
      },
    });
    if (!order) return null;

    // Discount columns may not exist on a lagging DB — read best-effort.
    let discountAmount = 0;
    let discountLabel: string | null = null;
    try {
      const disc = await tx.order.findFirst({
        where: { id: orderId },
        select: { discountAmount: true, discountLabel: true },
      });
      discountAmount = disc?.discountAmount ?? 0;
      discountLabel = disc?.discountLabel ?? null;
    } catch {
      /* not migrated yet */
    }

    return buildTicket({
      restaurantName: restaurant.displayName || restaurant.name,
      address: receipt.address,
      phone: receipt.phone,
      website: receipt.website,
      footer: receipt.footer,
      tableNumber: order.table?.tableNumber ?? "—",
      orderId: order.id,
      createdAt: order.createdAt.toISOString(),
      total: order.total,
      discountAmount,
      discountLabel,
      items: order.items.map((i) => ({
        quantity: i.quantity,
        name: i.nameAtTime,
        modifiers: i.modifiers.map((m) => m.nameAtTime),
        note: i.note,
      })),
    });
  });
}
