"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { deductForOrder } from "@/server/inventory/deduct";
import { formatOrderNumber } from "@/lib/orders/order-number";
import { orderTypeLabelWithEmoji } from "@/lib/orders/order-type";
import { manilaStartOfDay } from "@/lib/time/manila";
import type { KitchenOrder } from "@/lib/orders/types";

const ACTIVE = ["new", "preparing"] as const;

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

  return decorate(staff.restaurantId, orders);
}

type RawKitchenOrder = {
  id: string;
  status: string;
  createdAt: Date;
  total: number;
  table: { tableNumber: string } | null;
  items: {
    id: string;
    nameAtTime: string;
    quantity: number;
    note: string | null;
    modifiers: { nameAtTime: string }[];
  }[];
};

/**
 * Adds the card title and the type line. Shared by the live queue and the
 * history so a ticket reads identically whichever list it's in — a cook
 * checking what they just closed shouldn't have to re-read a different layout.
 */
async function decorate(
  restaurantId: string,
  orders: RawKitchenOrder[],
): Promise<KitchenOrder[]> {
  // Best-effort pickup/delivery/counter labels (columns may lag on prod).
  const labels = new Map<string, string>();
  const types = new Map<string, string>();
  try {
    const meta = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: orders.map((o) => o.id) }, orderType: { not: "dine_in" } },
        select: { id: true, orderType: true, customerName: true, orderNumber: true },
      }),
    );
    for (const m of meta) {
      // A counter/stall order shows its big daily ticket number to the kitchen.
      // The type reads the same word here as on the cashier screen and the
      // receipt — the kitchen assembles from all three.
      const label = orderTypeLabelWithEmoji(m.orderType);
      if (m.orderNumber != null) {
        labels.set(m.id, formatOrderNumber(m.orderNumber));
        types.set(m.id, label);
        continue;
      }
      // Title = who the order is for; the type shows on its own line.
      labels.set(m.id, m.customerName?.trim() || "Customer");
      types.set(m.id, label);
    }
  } catch {
    /* not migrated yet */
  }

  return orders.map((o) => ({
    id: o.id,
    tableNumber: labels.get(o.id) ?? o.table?.tableNumber ?? "—",
    typeLabel: types.get(o.id) ?? orderTypeLabelWithEmoji("dine_in"),
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

      // The other half of "paid AND cooked": a takeout order paid up front has
      // nothing left to do at the till, so finishing it here closes it. An
      // unpaid order stays on the cashier board waiting to be settled.
      try {
        await tenantDb(staff.restaurantId, (tx) =>
          tx.order.updateMany({
            where: { id: orderId, status: "done", paymentStatus: "paid" },
            data: { status: "closed" },
          }),
        );
      } catch {
        /* leave it on the board rather than lose the order */
      }
    }

    // Signal other screens (cashier, diner phones, other kitchen tablets).
    await notifyOrdersChanged(staff.restaurantId);

    return { ok: true, orders: await getKitchenOrders() };
  } catch (e) {
    console.error("advanceOrderStatus failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the order." };
  }
}

/**
 * Recently finished tickets, newest first.
 *
 * The kitchen display is a queue, so a ticket advanced by mistake — a stray tap
 * on a busy screen, or the wrong card in a row of three — used to vanish with
 * no way back, and the food never got made. This is the way back.
 */
export async function getKitchenHistory(): Promise<KitchenOrder[]> {
  const staff = await requireStaff(["kitchen", "admin", "cashier"]);
  const since = manilaStartOfDay();
  try {
    const orders = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { status: { in: ["done", "closed"] }, updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take: 40,
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
    return decorate(staff.restaurantId, orders);
  } catch {
    return [];
  }
}

/**
 * Put a finished ticket back in the queue.
 *
 * Goes to `preparing`, not `new`: the food was at least started, and dropping
 * it back to the top of a busy queue as if it had just arrived would lose the
 * fact that a customer has already been waiting.
 *
 * Deliberately allowed for a CLOSED order too. A takeout paid up front closes
 * itself the moment the kitchen marks it done, so "closed" is exactly the state
 * a mis-tapped ticket lands in — refusing to reopen those would leave the one
 * case this exists for unfixable.
 */
export async function reopenKitchenOrder(
  orderId: string,
): Promise<{ ok: boolean; orders?: KitchenOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["kitchen", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  try {
    const res = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({
        // Never resurrect a cancelled/voided order — that one was deliberate.
        where: { id: orderId, status: { in: ["done", "closed"] } },
        data: { status: "preparing" },
      }),
    );
    if (res.count === 0) return { ok: false, error: "That ticket can't be brought back." };
    await notifyOrdersChanged(staff.restaurantId);
    return { ok: true, orders: await getKitchenOrders() };
  } catch (e) {
    console.error("reopenKitchenOrder failed", e);
    return { ok: false, error: "Couldn't bring that ticket back." };
  }
}
