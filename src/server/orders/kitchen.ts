"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { deductForOrder } from "@/server/inventory/deduct";
import type { KitchenOrder } from "@/lib/orders/types";

const ACTIVE = ["new", "preparing"] as const;

/** Maps DB orders to the serializable KitchenOrder view-model. */
function toKitchenOrders(
  orders: {
    id: string;
    tableNumber?: string;
    status: string;
    createdAt: Date;
    total: number;
    table?: { tableNumber: string } | null;
    items: {
      id: string;
      nameAtTime: string;
      quantity: number;
      note: string | null;
      modifiers: { nameAtTime: string }[];
    }[];
  }[],
): KitchenOrder[] {
  return orders.map((o) => ({
    id: o.id,
    tableNumber: o.table?.tableNumber ?? "—",
    status: o.status as KitchenOrder["status"],
    createdAt: o.createdAt.toISOString(),
    total: o.total,
    items: o.items.map((it) => ({
      id: it.id,
      name: it.nameAtTime,
      quantity: it.quantity,
      note: it.note,
      modifiers: it.modifiers.map((m) => m.nameAtTime),
    })),
  }));
}

/** Active orders (new + preparing) for the logged-in staff's restaurant. */
export async function getKitchenOrders(): Promise<KitchenOrder[]> {
  const staff = await requireStaff(["kitchen", "admin", "cashier"]);
  const orders = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: { in: [...ACTIVE] } },
      orderBy: { createdAt: "asc" },
      include: {
        table: { select: { tableNumber: true } },
        items: { include: { modifiers: { select: { nameAtTime: true } } } },
      },
    }),
  );
  return toKitchenOrders(orders);
}

/**
 * Advances an order's status (new → preparing → done). Kitchen + admin only.
 * Returns the refreshed active list so the caller can update instantly.
 */
export async function advanceOrderStatus(
  orderId: string,
  toStatus: "preparing" | "done",
): Promise<{ ok: boolean; orders?: KitchenOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["kitchen", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.update({ where: { id: orderId }, data: { status: toStatus } }),
  );

  // Consumption happens when the kitchen finishes the order.
  if (toStatus === "done") {
    await deductForOrder(staff.restaurantId, orderId);
  }

  // Signal other screens (cashier, other kitchen tablets) to refresh.
  await notifyOrdersChanged(staff.restaurantId);

  const orders = await getKitchenOrders();
  return { ok: true, orders };
}
