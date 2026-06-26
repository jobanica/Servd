"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { autoPrintIfEnabled, printReceipt, printKitchenIfNeeded } from "@/server/printing/print";
import { getPublicMenu } from "@/server/menu/public-menu";
import { recordServingsSold } from "@/server/menu/servings";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
  type OrderLineInput,
} from "@/server/orders/build-order";
import type { DinerCategory } from "@/lib/cart/types";
import { computeDiscount, netTotal, type DiscountKind } from "@/lib/discount";
import { pesosToCentavos } from "@/lib/money";
import { formatOrderNumber } from "@/lib/orders/order-number";
import { isVoidReason } from "@/lib/orders/void-reasons";
import { writeAudit } from "@/server/audit/log";
import { awardPointsForOrder, getBalance, getLoyaltyConfig, redeemPoints, enrollAccount } from "@/server/loyalty/loyalty";
import { notifyCustomer, restaurantDisplayName } from "@/server/sms/notify";

export interface CashierOrder {
  id: string;
  status: string;
  paymentStatus: string;
  total: number;
  discountAmount: number;
  discountLabel: string | null;
  creditApplied: number; // centavos paid by a redeemed gift card
  paid: number; // centavos already tendered (split/partial payments)
  net: number; // total - discount - credit
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

/** Best-effort per-order redeemed gift-card credit (column may lag on prod). */
async function creditMap(restaurantId: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({ where: { id: { in: ids } }, select: { id: true, creditApplied: true } }),
    );
    return new Map(rows.map((o) => [o.id, o.creditApplied ?? 0]));
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
  Map<string, { orderType: string; customerName: string | null; customerPhone: string | null; customerAddress: string | null; mapUrl: string | null; orderNumber: number | null }>
> {
  if (ids.length === 0) return new Map();
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, orderType: true, customerName: true, customerPhone: true, customerAddress: true, customerLat: true, customerLng: true, orderNumber: true },
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
          orderNumber: o.orderNumber,
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
        payments: { where: { status: "paid" }, select: { gateway: true, amount: true } },
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
  const credits = await creditMap(staff.restaurantId, orders.map((o) => o.id));
  const meta = await orderMetaMap(staff.restaurantId, orders.map((o) => o.id));

  const byTable = new Map<string, CashierTable>();
  for (const o of orders) {
    const m = meta.get(o.id);
    const kind = (m?.orderType ?? "dine_in") as CashierTable["kind"];
    // A counter/stall order has an order number — one card per order, never
    // grouped under the shared counter "table".
    const isCounter = m?.orderNumber != null;
    // Dine-in groups by table; pickup/delivery/counter is one card per order.
    const isDineIn = !isCounter && (kind === "dine_in" || !!o.table);
    const key = isDineIn ? `table:${o.table?.id ?? o.id}` : `order:${o.id}`;
    const customerName = m?.customerName ?? null;
    const label = isDineIn
      ? `Table ${o.table?.tableNumber ?? "—"}`
      : isCounter
        ? `🧾 Order ${formatOrderNumber(m!.orderNumber!)}`
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
    const creditApplied = credits.get(o.id) ?? 0;
    const net = netTotal(o.total, discountAmount, creditApplied);
    const paid = o.payments.reduce((s, p) => s + (p.amount ?? 0), 0);
    t.orders.push({
      id: o.id,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      discountAmount,
      discountLabel: disc?.label ?? null,
      creditApplied,
      paid,
      net,
      billRequested: o.billRequested,
      paidOnline: o.payments.some((p) => p.gateway === "paymongo"),
      served: servedIds.has(o.id),
      createdAt: o.createdAt.toISOString(),
      itemCount: o._count.items,
    });
    if (o.paymentStatus !== "paid") t.outstanding += Math.max(0, net - paid);
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
    const isCounter = m?.orderNumber != null;
    const isDineIn = !isCounter && (kind === "dine_in" || !!o.table);
    const label = isDineIn
      ? `Table ${o.table?.tableNumber ?? "—"}`
      : isCounter
        ? `🧾 Order ${formatOrderNumber(m!.orderNumber!)}`
        : kind === "delivery"
          ? `🛵 Delivery — ${m?.customerName ?? "Customer"}`
          : `🥡 Pickup — ${m?.customerName ?? "Customer"}`;
    return {
      id: o.id,
      tableNumber: isCounter ? formatOrderNumber(m!.orderNumber!) : o.table?.tableNumber ?? "—",
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
  // Set when a kitchen ticket must be printed by the browser (no kitchen display).
  printKitchen?: boolean;
  printOrderId?: string;
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

  let printKitchen = false;
  if (res.count > 0) {
    await notifyOrdersChanged(staff.restaurantId);
    await autoPrintIfEnabled(staff.restaurantId, orderId);
    // No kitchen display → print a kitchen ticket on accept.
    printKitchen = (await printKitchenIfNeeded(staff.restaurantId, orderId)).clientPrintNeeded;

    // Confirmation SMS for pickup/delivery customers (best-effort).
    const m = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId);
    if (m && m.orderType !== "dine_in" && m.customerPhone) {
      const who = await restaurantDisplayName(staff.restaurantId);
      const ref = orderId.slice(0, 8).toUpperCase();
      const mode = m.orderType === "delivery" ? "for delivery" : "for pickup";
      const hi = m.customerName ? `Hi ${m.customerName}, ` : "";
      await notifyCustomer(
        staff.restaurantId,
        m.customerPhone,
        `${hi}your order #${ref} at ${who} is confirmed ${mode}. We'll prepare it now. Salamat!`,
      );
    }
  }
  return {
    ok: true,
    incoming: await getIncomingOrders(),
    tables: await getCashierTables(),
    printKitchen,
    printOrderId: printKitchen ? orderId : undefined,
  };
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
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string; printTicket?: boolean }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  // Charge the discounted (net) amount, less any gift-card credit already applied.
  const disc = (await discountMap(staff.restaurantId, [orderId])).get(orderId);
  const credit = (await creditMap(staff.restaurantId, [orderId])).get(orderId) ?? 0;
  let netPaid = 0;

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({ where: { id: orderId }, select: { total: true } });
      if (!order) throw new Error("Order not found");
      const net = netTotal(order.total, disc?.amount ?? 0, credit);
      // Settle only what's still owed after any prior split/partial tenders.
      const agg = await tx.payment.aggregate({ where: { orderId, status: "paid" }, _sum: { amount: true } });
      const amount = Math.max(0, net - (agg._sum.amount ?? 0));
      netPaid = net;
      // updateMany (not update) so it doesn't read the whole row back — keeps
      // working even if the prod schema lags (e.g. missing newer columns).
      await tx.order.updateMany({
        where: { id: orderId },
        // Paying in person settles the order: mark paid AND close it.
        data: { paymentStatus: "paid", billRequested: false, status: "closed" },
      });
      if (amount > 0) {
        await tx.payment.create({
          data: { orderId, amount, method, gateway: "manual", status: "paid" },
        });
      }
    });
  } catch (e) {
    console.error("markOrderPaid failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not record the payment." };
  }

  // Award loyalty points (best-effort) to the order's customer phone.
  const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
  await awardPointsForOrder(staff.restaurantId, orderId, netPaid, phone);

  // Always print the receipt on an explicit cash/card settle (independent of the
  // auto-print-on-new-order toggle). Server transports print straight to the
  // printer; client transports open the ticket page from the cashier board.
  const { clientPrintNeeded } = await printReceipt(staff.restaurantId, orderId);

  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables(), printTicket: clientPrintNeeded };
}

export type PartialPaymentResult =
  | { ok: true; settled: boolean; remaining: number; tables: CashierTable[]; printTicket?: boolean }
  | { ok: false; error: string };

/**
 * Split / partial payment — record one tender (cash or card) toward an order's
 * net. The amount is clamped server-side to what's still owed; when the running
 * total of tenders covers the net, the order is settled (paid + closed) and the
 * receipt prints. Money is never trusted from the client.
 */
export async function recordPartialPayment(
  orderId: string,
  amountPesos: number,
  method: "cash" | "card_terminal",
): Promise<PartialPaymentResult> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const requested = pesosToCentavos(Number(amountPesos) || 0);
  if (requested <= 0) return { ok: false, error: "Enter an amount." };

  const disc = (await discountMap(staff.restaurantId, [orderId])).get(orderId);
  const credit = (await creditMap(staff.restaurantId, [orderId])).get(orderId) ?? 0;
  let settled = false;
  let remaining = 0;

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: { total: true },
      });
      if (!order) throw new Error("This order is already settled.");
      const net = netTotal(order.total, disc?.amount ?? 0, credit);
      const agg = await tx.payment.aggregate({
        where: { orderId, status: "paid" },
        _sum: { amount: true },
      });
      const paidSoFar = agg._sum.amount ?? 0;
      const owed = Math.max(0, net - paidSoFar);
      if (owed <= 0) throw new Error("This order is already fully paid.");

      const amount = Math.min(requested, owed);
      await tx.payment.create({
        data: { orderId, amount, method, gateway: "manual", status: "paid" },
      });
      remaining = owed - amount;
      if (remaining <= 0) {
        settled = true;
        await tx.order.updateMany({
          where: { id: orderId },
          data: { paymentStatus: "paid", billRequested: false, status: "closed" },
        });
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't record the payment." };
  }

  let printTicket = false;
  if (settled) {
    const phone = (await orderMetaMap(staff.restaurantId, [orderId])).get(orderId)?.customerPhone ?? null;
    // Award loyalty on the full net once the order is settled.
    const disc2 = (await discountMap(staff.restaurantId, [orderId])).get(orderId);
    const credit2 = (await creditMap(staff.restaurantId, [orderId])).get(orderId) ?? 0;
    const order = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findFirst({ where: { id: orderId }, select: { total: true } }),
    );
    if (order) await awardPointsForOrder(staff.restaurantId, orderId, netTotal(order.total, disc2?.amount ?? 0, credit2), phone);
    printTicket = (await printReceipt(staff.restaurantId, orderId)).clientPrintNeeded;
  }

  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, settled, remaining, tables: await getCashierTables(), printTicket };
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

export interface ClosedOrder {
  id: string;
  label: string;
  total: number;
  paymentStatus: string;
  closedAt: string;
}

/** Recently closed orders (today) so the cashier can re-open one if needed. */
export async function getClosedOrders(): Promise<ClosedOrder[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return [];
  }
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const rows = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: "closed", updatedAt: { gte: startOfDay } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        total: true,
        paymentStatus: true,
        updatedAt: true,
        orderType: true,
        customerName: true,
        table: { select: { tableNumber: true } },
      },
    }),
  );
  return rows.map((o) => ({
    id: o.id,
    label:
      o.table?.tableNumber
        ? `Table ${o.table.tableNumber}`
        : o.customerName || (o.orderType === "delivery" ? "Delivery" : o.orderType === "takeout" ? "Pickup" : "Order"),
    total: o.total,
    paymentStatus: o.paymentStatus,
    closedAt: o.updatedAt.toISOString(),
  }));
}

/** Re-open a closed order so it returns to the active board. */
export async function reopenOrder(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; closed?: ClosedOrder[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      // Back to "done" (ready/served) so it shows on the board again; payment
      // status is left untouched so an already-paid order stays paid.
      tx.order.updateMany({
        where: { id: orderId, status: "closed" },
        data: { status: "done" },
      }),
    );
  } catch (e) {
    console.error("reopenOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not re-open the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables(), closed: await getClosedOrders() };
}

/**
 * Void an unpaid order. Requires the restaurant's cashier void PIN — so a
 * cashier can't dismiss an order without authorization. Voided orders are
 * cancelled (they leave the board and never count as sales, since sales come
 * from confirmed payments).
 */
export async function voidOrder(
  orderId: string,
  pin: string,
  reason?: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  const entered = (pin ?? "").trim();
  if (!entered) return { ok: false, error: "Enter the void PIN." };
  const reasonText = (reason ?? "").trim();
  if (!reasonText || !isVoidReason(reasonText)) return { ok: false, error: "Select a reason for the void." };

  const pinCheck = await checkVoidPin(staff.restaurantId, entered);
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const before = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: { id: true, status: true, total: true, tableId: true, creditApplied: true, giftCardId: true },
      });
      if (!before) throw new Error("Only an unpaid order can be voided.");
      // Restore any redeemed gift-card balance (the void unwinds the redemption).
      if (before.giftCardId && before.creditApplied > 0) {
        await tx.giftCard.update({
          where: { id: before.giftCardId },
          data: { balance: { increment: before.creditApplied } },
        });
        await tx.giftCardTxn.create({
          data: { restaurantId: staff.restaurantId, giftCardId: before.giftCardId, amount: before.creditApplied, kind: "restore", orderId },
        });
      }
      // Cancelled status removes it from the board; tag voidedAt for reconciliation.
      await tx.order.updateMany({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        data: { status: "cancelled", billRequested: false, voidedAt: new Date(), creditApplied: 0, giftCardId: null },
      });
      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "order.void",
        entityType: "order",
        entityId: orderId,
        reason: reasonText,
        before: { status: before.status, total: before.total },
        after: { status: "cancelled" },
      });
    });
  } catch (e) {
    console.error("voidOrder failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not void the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

/** Verifies the cashier void PIN (best-effort read — column may lag on prod). */
async function checkVoidPin(
  restaurantId: string,
  entered: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let configured: string | null = null;
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { cashierVoidPin: true } }),
    );
    configured = r?.cashierVoidPin ?? null;
  } catch {
    return { ok: false, error: "Void isn't set up yet. Ask an admin to set a void PIN." };
  }
  if (!configured) return { ok: false, error: "No void PIN set. Ask an admin to set one in Settings." };
  if (entered !== configured) return { ok: false, error: "Incorrect PIN." };
  return { ok: true };
}

export interface EditableItem {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number; // centavos (unit incl. modifiers × qty)
}

/** Items on an open, unpaid order — for the manager edit (void-item) view. */
export async function getOrderItems(orderId: string): Promise<EditableItem[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return [];
  }
  const order = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findFirst({
      where: { id: orderId, paymentStatus: { not: "paid" } },
      select: {
        items: {
          select: {
            id: true,
            nameAtTime: true,
            quantity: true,
            unitPrice: true,
            modifiers: { select: { priceDeltaAtTime: true } },
          },
        },
      },
    }),
  );
  if (!order) return [];
  return order.items.map((i) => ({
    id: i.id,
    name: i.nameAtTime,
    quantity: i.quantity,
    lineTotal: (i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0)) * i.quantity,
  }));
}

/**
 * Manager edit — void a single line item from an unpaid order. Requires the
 * void PIN + a reason, recomputes the order total SERVER-SIDE from the
 * remaining items (never trusts the client), and logs to the audit trail. If
 * the last item is removed, the whole order is voided.
 */
export async function voidOrderItem(
  orderId: string,
  itemId: string,
  pin: string,
  reason?: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const entered = (pin ?? "").trim();
  if (!entered) return { ok: false, error: "Enter the void PIN." };
  const reasonText = (reason ?? "").trim();
  if (!reasonText || !isVoidReason(reasonText)) return { ok: false, error: "Select a reason." };

  const pinCheck = await checkVoidPin(staff.restaurantId, entered);
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error };

  try {
    await tenantDb(staff.restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, paymentStatus: { not: "paid" } },
        select: {
          id: true,
          total: true,
          items: {
            select: {
              id: true,
              nameAtTime: true,
              quantity: true,
              unitPrice: true,
              modifiers: { select: { priceDeltaAtTime: true } },
            },
          },
        },
      });
      if (!order) throw new Error("Only an unpaid order can be edited.");
      const target = order.items.find((i) => i.id === itemId);
      if (!target) throw new Error("Item not found on this order.");

      const lineValue = (it: (typeof order.items)[number]) =>
        (it.unitPrice + it.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0)) * it.quantity;
      const remaining = order.items.filter((i) => i.id !== itemId);
      const newTotal = remaining.reduce((s, i) => s + lineValue(i), 0);

      // Remove the line (its modifiers cascade) and recompute the order total.
      await tx.orderItem.delete({ where: { id: itemId } });

      if (remaining.length === 0) {
        // Nothing left — void the whole order.
        await tx.order.update({
          where: { id: orderId },
          data: { total: 0, status: "cancelled", billRequested: false, voidedAt: new Date() },
        });
      } else {
        await tx.order.update({ where: { id: orderId }, data: { total: newTotal } });
      }

      await writeAudit(tx, staff.restaurantId, {
        actorStaffId: staff.staffUserId,
        actorEmail: staff.email,
        action: "order.item_void",
        entityType: "order_item",
        entityId: itemId,
        reason: reasonText,
        before: {
          orderId,
          item: { name: target.nameAtTime, quantity: target.quantity, lineTotal: lineValue(target) },
          orderTotal: order.total,
        },
        after: { orderTotal: remaining.length === 0 ? 0 : newTotal, orderVoided: remaining.length === 0 },
      });
    });
  } catch (e) {
    console.error("voidOrderItem failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not edit the order." };
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

export interface VoidedOrder {
  id: string;
  label: string;
  total: number;
  voidedAt: string;
}

/** Orders voided today, for end-of-shift reconciliation. */
export async function getVoidedOrders(): Promise<VoidedOrder[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return [];
  }
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  try {
    const rows = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { voidedAt: { gte: startOfDay } },
        orderBy: { voidedAt: "desc" },
        take: 50,
        select: {
          id: true,
          total: true,
          voidedAt: true,
          orderType: true,
          customerName: true,
          table: { select: { tableNumber: true } },
        },
      }),
    );
    return rows.map((o) => ({
      id: o.id,
      label: o.table?.tableNumber
        ? `Table ${o.table.tableNumber}`
        : o.customerName || (o.orderType === "delivery" ? "Delivery" : o.orderType === "takeout" ? "Pickup" : "Order"),
      total: o.total,
      voidedAt: (o.voidedAt ?? new Date()).toISOString(),
    }));
  } catch {
    return [];
  }
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
}): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string; printKitchen?: boolean; printOrderId?: string }> {
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

  // Count these servings toward each item's daily cap (best-effort, own tx).
  await recordServingsSold(staff.restaurantId, built.items);

  await notifyOrdersChanged(staff.restaurantId);
  await autoPrintIfEnabled(staff.restaurantId, orderId);
  // No kitchen display → print a kitchen ticket for the new order.
  const kitchen = await printKitchenIfNeeded(staff.restaurantId, orderId);

  // Auto-enroll pickup/delivery customers into loyalty (name + phone given).
  if (orderType !== "dine_in" && input.customerPhone?.trim()) {
    try {
      const cfg = await getLoyaltyConfig(staff.restaurantId);
      if (cfg.enabled) await enrollAccount(staff.restaurantId, input.customerPhone, input.customerName);
    } catch {
      /* best-effort */
    }
  }
  return {
    ok: true,
    tables: await getCashierTables(),
    printKitchen: kitchen.clientPrintNeeded,
    printOrderId: kitchen.clientPrintNeeded ? orderId : undefined,
  };
}
