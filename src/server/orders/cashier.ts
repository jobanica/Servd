"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { autoPrintIfEnabled } from "@/server/printing/print";
import { getPublicMenu } from "@/server/menu/public-menu";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
  type OrderLineInput,
} from "@/server/orders/build-order";
import type { DinerCategory } from "@/lib/cart/types";

export interface CashierOrder {
  id: string;
  status: string;
  paymentStatus: string;
  total: number;
  billRequested: boolean;
  paidOnline: boolean; // a confirmed gateway (PayMongo) payment exists
  createdAt: string;
  itemCount: number;
}

export interface CashierTable {
  tableId: string;
  tableNumber: string;
  orders: CashierOrder[];
  outstanding: number; // sum of unpaid order totals (centavos)
  billRequested: boolean;
}

/** A QR order awaiting the cashier's acceptance. */
export interface IncomingOrder {
  id: string;
  tableNumber: string;
  total: number;
  paymentStatus: string;
  createdAt: string;
  items: { name: string; quantity: number; note: string | null; modifiers: string[] }[];
}

const OPEN = ["new", "preparing", "done"] as const;

/** Open orders grouped per table, for the cashier. */
export async function getCashierTables(): Promise<CashierTable[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  const orders = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: { in: [...OPEN] } },
      orderBy: { createdAt: "asc" },
      // Explicit select so a schema lag (newer columns) can't break this query.
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        total: true,
        billRequested: true,
        createdAt: true,
        table: { select: { id: true, tableNumber: true } },
        _count: { select: { items: true } },
        payments: { where: { status: "paid" }, select: { gateway: true } },
      },
    }),
  );

  const byTable = new Map<string, CashierTable>();
  for (const o of orders) {
    const key = o.table.id;
    if (!byTable.has(key)) {
      byTable.set(key, {
        tableId: o.table.id,
        tableNumber: o.table.tableNumber,
        orders: [],
        outstanding: 0,
        billRequested: false,
      });
    }
    const t = byTable.get(key)!;
    t.orders.push({
      id: o.id,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      billRequested: o.billRequested,
      paidOnline: o.payments.some((p) => p.gateway === "paymongo"),
      createdAt: o.createdAt.toISOString(),
      itemCount: o._count.items,
    });
    if (o.paymentStatus !== "paid") t.outstanding += o.total;
    if (o.billRequested) t.billRequested = true;
  }

  return [...byTable.values()];
}

/** QR orders awaiting acceptance (the cashier's incoming-order queue). */
export async function getIncomingOrders(): Promise<IncomingOrder[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  const orders = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        total: true,
        paymentStatus: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
        items: {
          select: {
            nameAtTime: true,
            quantity: true,
            note: true,
            modifiers: { select: { nameAtTime: true } },
          },
        },
      },
    }),
  );
  return orders.map((o) => ({
    id: o.id,
    tableNumber: o.table?.tableNumber ?? "—",
    total: o.total,
    paymentStatus: o.paymentStatus,
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((it) => ({
      name: it.nameAtTime,
      quantity: it.quantity,
      note: it.note,
      modifiers: it.modifiers.map((m) => m.nameAtTime),
    })),
  }));
}

export interface CashierState {
  ok: boolean;
  incoming?: IncomingOrder[];
  tables?: CashierTable[];
  error?: string;
}

/** Accept an incoming QR order → moves it into the kitchen + prints the ticket. */
export async function acceptOrder(orderId: string): Promise<CashierState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  // Guarded by status so a double-tap (or two cashiers) can't accept twice.
  const res = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "new" } }),
  );

  if (res.count > 0) {
    await notifyOrdersChanged(staff.restaurantId);
    await autoPrintIfEnabled(staff.restaurantId, orderId);
  }
  return { ok: true, incoming: await getIncomingOrders(), tables: await getCashierTables() };
}

/** Decline an incoming QR order → cancels it. */
export async function declineOrder(orderId: string): Promise<CashierState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "cancelled" } }),
  );
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, incoming: await getIncomingOrders(), tables: await getCashierTables() };
}

/** Record an in-person payment (cash/card). Marks paid AND closes the order. */
export async function markOrderPaid(
  orderId: string,
  method: "cash" | "card_terminal",
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, select: { total: true } });
      if (!order) throw new Error("Order not found");
      await tx.order.update({
        where: { id: orderId },
        // Paying in person settles the order: mark paid AND close it.
        data: { paymentStatus: "paid", billRequested: false, status: "closed" },
      });
      await tx.payment.create({
        data: { orderId, amount: order.total, method, gateway: "manual", status: "paid" },
      });
    });
  } catch (e) {
    console.error("markOrderPaid failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the payment." };
  }

  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

/** Close (settle) an order so it leaves the active boards. */
export async function closeOrder(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.update({
      where: { id: orderId },
      data: { status: "closed", billRequested: false },
    }),
  );
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

// ---------------------------------------------------------------------------
// Cashier POS — create an order directly (walk-up / phone / counter orders).
// ---------------------------------------------------------------------------

/** Menu (categories → items → modifiers) for the cashier's restaurant. */
export async function getPosMenu(): Promise<DinerCategory[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  return getPublicMenu(staff.restaurantId);
}

/** Tables for the cashier's restaurant (for picking where an order belongs). */
export async function getPosTables(): Promise<{ id: string; tableNumber: string }[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  return tenantDb(staff.restaurantId, (tx) =>
    tx.table.findMany({ orderBy: { tableNumber: "asc" }, select: { id: true, tableNumber: true } }),
  );
}

/**
 * Create an order from the cashier POS. Cashier-created orders are already
 * accepted, so they go straight to the kitchen (status "new") and print.
 */
export async function createCashierOrder(input: {
  tableId: string;
  lines: OrderLineInput[];
}): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  if (!input.tableId) return { ok: false, error: "Pick a table first." };
  if (!input.lines?.length) return { ok: false, error: "Add at least one item." };

  let built;
  try {
    built = await buildValidatedOrder(staff.restaurantId, input.lines);
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "Could not build the order." };
  }

  let orderId: string;
  try {
    const order = await tenantDb(staff.restaurantId, async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: input.tableId },
        select: { id: true },
      });
      if (!table) throw new Error("That table doesn't exist.");
      return tx.order.create({
        data: {
          restaurantId: staff.restaurantId,
          tableId: table.id,
          status: "new",
          paymentStatus: "unpaid",
          total: built.total,
          items: { create: orderItemsCreate(built.items) },
        },
        select: { id: true },
      });
    });
    orderId = order.id;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the order." };
  }

  await notifyOrdersChanged(staff.restaurantId);
  await autoPrintIfEnabled(staff.restaurantId, orderId);
  return { ok: true, tables: await getCashierTables() };
}
