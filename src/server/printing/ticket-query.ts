import { tenantDb } from "@/server/tenancy/scoped-db";
import type { OrderTypeKey } from "@/lib/orders/order-type";
import { buildTicket, type Ticket, type TicketKind } from "@/lib/printing/ticket";
import { restaurantSiteUrl } from "@/lib/qr";

/** Loads an order and shapes it into a Ticket (tenant-scoped). */
export async function getOrderTicket(
  restaurantId: string,
  orderId: string,
  kind: TicketKind = "receipt",
): Promise<Ticket | null> {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: { name: true, displayName: true, slug: true, printerConfig: true },
    });
    const receipt =
      ((restaurant.printerConfig as {
        receipt?: { address?: string | null; phone?: string | null; website?: string | null; footer?: string | null; showVat?: boolean };
      } | null)?.receipt) ?? {};
    const order = await tx.order.findFirst({
      where: { id: orderId },
      // Explicit select (no SELECT *) so a lagging schema can't break printing.
      select: {
        id: true,
        total: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
        // orderType / customer columns may lag — read separately below.
        items: {
          select: {
            quantity: true,
            nameAtTime: true,
            note: true,
            unitPrice: true,
            modifiers: { select: { nameAtTime: true, priceDeltaAtTime: true } },
          },
        },
      },
    });
    if (!order) return null;

    // Latest settled payment → shown as the tendered line on the receipt.
    let paymentMethod: string | null = null;
    let paymentAmount: number | null = null;
    try {
      const pay = await tx.payment.findFirst({
        where: { orderId, status: "paid" },
        orderBy: { createdAt: "desc" },
        select: { method: true, amount: true },
      });
      if (pay) {
        paymentMethod = pay.method;
        paymentAmount = pay.amount;
      }
    } catch {
      /* no payment yet */
    }

    // Discount + order-type columns may not exist on a lagging DB — best-effort.
    let discountAmount = 0;
    let discountLabel: string | null = null;
    let orderType: OrderTypeKey = "dine_in";
    let customerName: string | null = null;
    let customerAddress: string | null = null;
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
    try {
      const meta = await tx.order.findFirst({
        where: { id: orderId },
        select: { orderType: true, customerName: true, customerAddress: true },
      });
      orderType = (meta?.orderType ?? "dine_in") as typeof orderType;
      customerName = meta?.customerName ?? null;
      customerAddress = meta?.customerAddress ?? null;
    } catch {
      /* not migrated yet */
    }

    return buildTicket({
      kind,
      restaurantName: restaurant.displayName || restaurant.name,
      address: receipt.address,
      phone: receipt.phone,
      website: receipt.website,
      footer: receipt.footer,
      showVat: receipt.showVat,
      tableNumber: order.table?.tableNumber ?? "—",
      orderType,
      customerName,
      customerAddress,
      orderId: order.id,
      createdAt: order.createdAt.toISOString(),
      total: order.total,
      discountAmount,
      discountLabel,
      paymentMethod,
      paymentAmount,
      qrUrl: restaurantSiteUrl(restaurant.slug),
      items: order.items.map((i) => {
        const unit = i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0);
        return {
          quantity: i.quantity,
          name: i.nameAtTime,
          modifiers: i.modifiers.map((m) => m.nameAtTime),
          note: i.note,
          lineTotal: unit * i.quantity,
        };
      }),
    });
  });
}
