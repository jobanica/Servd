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
import { computeDiscount, netTotal, type DiscountKind } from "@/lib/discount";
import { awardPointsForOrder, getBalance, getLoyaltyConfig, redeemPoints, enrollAccount } from "@/server/loyalty/loyalty";

export interface CashierOrder {
  id: string;
  status: string;
  paymentStatus: string;
  total: number;
  discountAmount: number;
  discountLabel: string | null;
  net: number; // total - discount
  billRequested: boolean;
  paidOnline: boolean; // a confirmed gateway (PayMongo) payment exists
  served: boolean; // cashier confirmed the food was served
  createdAt: string;
  itemCount: number;
}

/**
 * Best-effort per-order discount lookup. The discount columns may not exist yet
 * on a lagging prod DB — return an empty map then (treated as no discount).
 */
async function discountMap(
  restaurantId: string,
  ids: string[],
): Promise<Map<string, { amount: number; label: string | null }>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, discountAmount: true, discountLabel: true },
      }),
    );
    return new Map(rows.map((o) => [o.id, { amount: o.discountAmount, label: o.discountLabel }]));
  } catch {
    return new Map();
  }
}

export interface CashierTable {
  tableId: string; // group key (table id, or "order:<id>" for pickup/delivery)
  tableNumber: string; // dine-in table label
  kind: "dine_in" | "takeout" | "delivery";
  label: string; // header label ("Table 5", "Pickup — Juan", "Delivery — Ana")
  customerPhone: string | null;
  customerAddress: string | null;
  mapUrl: string | null;
  orders: CashierOrder[];
  outstanding: number; // sum of unpaid order totals (centavos)
  billRequested: boolean;
}

/** Best-effort per-order type/customer lookup (columns may lag on prod). */
async function orderMetaMap(
  restaurantId: string,
  ids: string[],
): Promise<
  Map<string, { orderType: string; customerName: string | null; customerPhone: string | null; customerAddress: string | null; mapUrl: string | null }>
> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, orderType: true, customerName: true, customerPhone: true, customerAddress: true, customerLat: true, customerLng: true },
      }),
    );
    return new Map(
      rows.map((o) => [
        o.id,
        {
          orderType: o.orderType,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          customerAddress: o.customerAddress,
          mapUrl: o.customerLat != null && o.customerLng != null ? `https://maps.google.com/?q=${o.customerLat},${o.customerLng}` : null,
        },
      ]),
    );
  } catch {
    return new Map();
  }
}

/** A QR order awaiting the cashier's acceptance. */
export interface IncomingOrder {
  id: string;
  tableNumber: string;
  label: string; // "Table 5" or "🥡 Pickup — Juan" / "🛵 Delivery — Ana"
  channel: string; // dine_in | takeout | delivery
  customerPhone: string | null;
  customerAddress: string | null;
  mapUrl: string | null;
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

  // Which finished orders are already served. Best-effort: the servedAt column
  // may not exist yet on a lagging production DB — treat all as not-served then.
  let servedIds = new Set<string>();
  try {
    const served = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { status: "done", servedAt: { not: null } },
        select: { id: true },
      }),
    );
    servedIds = new Set(served.map((o) => o.id));
  } catch {
    /* column not migrated yet — leave servedIds empty */
  }

  const discounts = await discountMap(staff.restaurantId, orders.map((o) => o.id));
  const meta = await orderMetaMap(staff.restaurantId, orders.map((o) => o.id));

  const byTable = new Map<string, CashierTable>();
  for (const o of orders) {
    const m = meta.get(o.id);
    const kind = (m?.orderType ?? "dine_in") as CashierTable["kind"];
    // Dine-in groups by table; pickup/delivery is one card per order.
    const isDineIn = kind === "dine_in" || !!o.table;
    const key = isDineIn ? `table:${o.table?.id ?? o.id}` : `order:${o.id}`;
    const customerName = m?.customerName ?? null;
    const label = isDineIn
      ? `Table ${o.table?.tableNumber ?? "—"}`
      : kind === "delivery"
        ? `🛵 Delivery — ${customerName ?? "Customer"}`
        : `🥡 Pickup — ${customerName ?? "Customer"}`;

    if (!byTable.has(key)) {
      byTable.set(key, {
        tableId: key,
        tableNumber: o.table?.tableNumber ?? "",
        kind: isDineIn ? "dine_in" : kind,
        label,
        customerPhone: m?.customerPhone ?? null,
        customerAddress: m?.customerAddress ?? null,
        mapUrl: m?.mapUrl ?? null,
        orders: [],
        outstanding: 0,
        billRequested: false,
      });
    }
    const t = byTable.get(key)!;
    const disc = discounts.get(o.id);
    const discountAmount = disc?.amount ?? 0;
    const net = netTotal(o.total, discountAmount);
    t.orders.push({
      id: o.id,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      discountAmount,
      discountLabel: disc?.label ?? null,
      net,
      billRequested: o.billRequested,
      paidOnline: o.payments.some((p) => p.gateway === "paymongo"),
      served: servedIds.has(o.id),
      createdAt: o.createdAt.toISOString(),
      itemCount: o._count.items,
    });
    if (o.paymentStatus !== "paid") t.outstanding += net;
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

  const meta = await orderMetaMap(staff.restaurantId, orders.map((o) => o.id));
  return orders.map((o) => {
    const m = meta.get(o.id);
    const kind = (m?.orderType ?? "dine_in") as string;
    const isDineIn = kind === "dine_in" || !!o.table;
    const label = isDineIn
      ? `Table ${o.table?.tableNumber ?? "—"}`
      : kind === "delivery"
        ? `🛵 Delivery — ${m?.customerName ?? "Customer"}`
        : `🥡 Pickup — ${m?.customerName ?? "Customer"}`;
    return {
      id: o.id,
      tableNumber: o.table?.tableNumber ?? "—",
      label,
      channel: isDineIn ? "dine_in" : kind,
      customerPhone: m?.customerPhone ?? null,
      customerAddress: m?.customerAddress ?? null,
      mapUrl: m?.mapUrl ?? null,
      total: o.total,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        name: it.nameAtTime,
        quantity: it.quantity,
        note: it.note,
        modifiers: it.modifiers.map((m) => m.nameAtTime),
      })),
    };
  });
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

  // Charge the discounted (net) amount if a discount was applied.
  const disc = (await discountMap(staff.restaurantId, [orderId])).get(orderId);
  let netPaid = 0;

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, select: { total: true } });
      if (!order) throw new Error("Order not found");
      const amount = netTotal(order.total, disc?.amount ?? 0);
      netPaid = amount;
      // updateMany (not update) so it doesn't read the whole row back — keeps
      // working even if the prod schema lags (e.g. missing newer columns).
      await tx.order.updateMany({
        where: { id: orderId },
        // Paying in person settles the order: mark paid AND close it.
        data: { paymentStatus: "paid", billRequested: false, status: "closed" },
      });
      await tx.payment.create({
        data: { orderId, amount, method, gateway: "manual", status: "paid" },
      });
    });
  } catch (e) {
    console.error("markOrderPaid failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the payment." };
  }

  // Award loyalty points (best-effort) to the order's customer phone.
  const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
  await awardPointsForOrder(staff.restaurantId, orderId, netPaid, phone);

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
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({
        where: { id: orderId },
        data: { status: "closed", billRequested: false },
      }),
    );
  } catch (e) {
    console.error("closeOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not close the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

/** Confirm a ready order's food was served to the table. */
export async function markServed(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { servedAt: new Date() } }),
    );
  } catch (e) {
    console.error("markServed failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not mark as served." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

/**
 * Apply (or clear) a discount on an order — Senior Citizen / PWD / custom.
 * Recomputed server-side from the order's gross total.
 */
export async function applyDiscount(
  orderId: string,
  kind: DiscountKind,
  value?: number,
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
      const { amount, label } = computeDiscount(order.total, kind, value);
      await tx.order.updateMany({
        where: { id: orderId },
        data: { discountAmount: amount, discountLabel: label },
      });
    });
  } catch (e) {
    console.error("applyDiscount failed", e);
    return {
      ok: false,
      error:
        e instanceof Error && /discountAmount|discountLabel|column/i.test(e.message)
          ? "Discounts need a quick database update. Run the discount migration, then try again."
          : e instanceof Error
            ? e.message
            : "Could not apply the discount.",
    };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

// ---------------------------------------------------------------------------
// Loyalty redemption at the cashier
// ---------------------------------------------------------------------------

/** Loyalty info for an order's customer (for the redeem UI). */
export async function getOrderLoyalty(
  orderId: string,
): Promise<{ enabled: boolean; phone: string | null; points: number; pointValue: number }> {
  const staff = await requireStaff(["cashier", "admin"]);
  const cfg = await getLoyaltyConfig(staff.restaurantId);
  const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
  const points = phone ? await getBalance(staff.restaurantId, phone) : 0;
  return { enabled: cfg.enabled, phone, points, pointValue: cfg.pointValue };
}

/** Redeem a customer's points on an order — applied as a discount. */
export async function redeemLoyalty(
  orderId: string,
  points: number,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
  if (!phone) return { ok: false, error: "This order has no customer phone for loyalty." };

  const order = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findFirst({ where: { id: orderId }, select: { total: true } }),
  );
  if (!order) return { ok: false, error: "Order not found." };

  const res = await redeemPoints(staff.restaurantId, phone, points);
  if (!res.ok) return { ok: false, error: res.error };

  // Apply the redeemed value as the order discount (capped at the total).
  const amount = Math.min(order.total, res.value ?? 0);
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({
        where: { id: orderId },
        data: { discountAmount: amount, discountLabel: `Loyalty (${points} pts)` },
      }),
    );
  } catch (e) {
    console.error("redeemLoyalty discount failed", e);
    return { ok: false, error: "Redeemed, but couldn't apply the discount. Please retry." };
  }
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
  orderType?: "dine_in" | "takeout" | "delivery";
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  lines: OrderLineInput[];
}): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const orderType = input.orderType ?? "dine_in";
  if (orderType === "dine_in" && !input.tableId) return { ok: false, error: "Pick a table first." };
  if (orderType !== "dine_in" && !input.customerName?.trim()) {
    return { ok: false, error: "Enter the customer's name." };
  }
  if (orderType === "delivery" && !input.customerAddress?.trim()) {
    return { ok: false, error: "Enter the delivery address." };
  }
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
      // Dine-in keeps the data minimal so it still works before the
      // pickup/delivery migration runs (orderType defaults to dine_in in DB).
      const base = {
        restaurantId: staff.restaurantId,
        status: "new" as const,
        paymentStatus: "unpaid" as const,
        total: built.total,
        items: { create: orderItemsCreate(built.items) },
      };

      if (orderType === "dine_in") {
        const table = await tx.table.findFirst({
          where: { id: input.tableId },
          select: { id: true },
        });
        if (!table) throw new Error("That table doesn't exist.");
        return tx.order.create({ data: { ...base, tableId: table.id }, select: { id: true } });
      }

      return tx.order.create({
        data: {
          ...base,
          orderType,
          customerName: input.customerName?.trim() || null,
          customerPhone: input.customerPhone?.trim() || null,
          customerAddress: input.customerAddress?.trim() || null,
        },
        select: { id: true },
      });
    });
    orderId = order.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create the order.";
    if (/orderType|customer|column/i.test(msg)) {
      return {
        ok: false,
        error: "Pickup/delivery needs a quick database update. Run the migration, then try again.",
      };
    }
    return { ok: false, error: msg };
  }

  await notifyOrdersChanged(staff.restaurantId);
  await autoPrintIfEnabled(staff.restaurantId, orderId);

  // Auto-enroll pickup/delivery customers into loyalty (name + phone given).
  if (orderType !== "dine_in" && input.customerPhone?.trim()) {
    try {
      const cfg = await getLoyaltyConfig(staff.restaurantId);
      if (cfg.enabled) await enrollAccount(staff.restaurantId, input.customerPhone, input.customerName);
    } catch {
      /* best-effort */
    }
  }
  return { ok: true, tables: await getCashierTables() };
}
