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
      // Explicit select so a schema lag (newer columns) can't break this query.
      select: {
        id: true,
        status: true,
        createdAt: true,
        total: true,
        table: { select: { tableNumber: true } },
        items: {
          select: {
            id: true,
            nameAtTime: true,
            quantity: true,
            note: true,
            modifiers: { select: { nameAtTime: true } },
          },
        },
      },
    }),
  );

  // Best-effort pickup/delivery labels (columns may lag on prod).
  const labels = new Map<string, string>();
  try {
    const meta = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: orders.map((o) => o.id) }, orderType: { not: "dine_in" } },
        select: { id: true, orderType: true, customerName: true },
      }),
    );
    for (const m of meta) {
      labels.set(
        m.id,
        `${m.orderType === "delivery" ? "🛵 Delivery" : "🥡 Pickup"} — ${m.customerName ?? "Customer"}`,
      );
    }
  } catch {
    /* not migrated yet */
  }

  return orders.map((o) => ({
    id: o.id,
    tableNumber: labels.get(o.id) ?? o.table?.tableNumber ?? "—",
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

  try {
    // updateMany never throws on a no-match (unlike update), so a stale tap or a
    // race with another tablet can't crash the action.
    const res = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { status: toStatus } }),
    );
    if (res.count === 0) return { ok: false, error: "That order is no longer active." };

    // Consumption happens when the kitchen finishes the order (best-effort).
    if (toStatus === "done") {
      await deductForOrder(staff.restaurantId, orderId);
    }

    // Signal other screens (cashier, diner phones, other kitchen tablets).
    await notifyOrdersChanged(staff.restaurantId);

    return { ok: true, orders: await getKitchenOrders() };
  } catch (e) {
    console.error("advanceOrderStatus failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the order." };
  }
}
