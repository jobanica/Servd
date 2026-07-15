"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { deductForOrder } from "@/server/inventory/deduct";
import { formatOrderNumber } from "@/lib/orders/order-number";
import type { StaffRole } from "@prisma/client";

/**
 * Server controller for the merchant "Incoming Orders" screen — a focused view
 * for restaurants that only use Servd's online-ordering channel (their own POS
 * handles dine-in). It does NOT create a parallel order system: it reads the
 * same orders, drives the same OrderStatus / deliveryStatus transitions, fires
 * the same realtime ping (so the customer's live tracker updates), and reuses
 * the same print + inventory paths the cashier/kitchen use.
 *
 * Online orders are the ones with no table (tableId IS NULL) — dine-in always
 * has a table. That filter is migration-safe (no dependency on newer columns).
 */

// The merchant screen is usable by the dedicated merchant role and by the
// owner/cashier (so a single-tablet shop can run it from any of those logins).
const MERCHANT_ROLES: StaffRole[] = ["merchant", "admin", "cashier"];

export type RejectReason = "out_of_stock" | "too_busy" | "closed";
const REJECT_REASONS: RejectReason[] = ["out_of_stock", "too_busy", "closed"];

export interface MerchantOrderItem {
  name: string;
  quantity: number;
  note: string | null;
  modifiers: string[];
}

export interface MerchantOrder {
  id: string;
  ref: string; // short reference (#ABC12345)
  orderNumber: string | null; // daily ticket, formatted (#007), if any
  orderType: string; // takeout | delivery | dine_in
  status: string; // pending | new | preparing | done | closed | cancelled
  deliveryStatus: string | null; // null | out_for_delivery | delivered
  paymentStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  total: number; // centavos, server-authoritative
  prepMinutes: number | null;
  cancelReason: string | null;
  scheduledFor: string | null; // ISO — advance order requested time (null = ASAP)
  createdAt: string; // ISO
  items: MerchantOrderItem[];
}

export interface MerchantData {
  incoming: MerchantOrder[]; // pending — awaiting accept/reject
  active: MerchantOrder[]; // accepted → in progress (new/preparing/done)
  history: MerchantOrder[]; // recent closed/cancelled
}

const ITEM_SELECT = {
  id: true,
  orderType: true,
  status: true,
  deliveryStatus: true,
  paymentStatus: true,
  orderNumber: true,
  customerName: true,
  customerPhone: true,
  customerAddress: true,
  total: true,
  createdAt: true,
  items: {
    select: {
      nameAtTime: true,
      quantity: true,
      note: true,
      modifiers: { select: { nameAtTime: true } },
    },
  },
} as const;

type Row = {
  id: string;
  orderType: string;
  status: string;
  deliveryStatus: string | null;
  paymentStatus: string;
  orderNumber: number | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  total: number;
  createdAt: Date;
  items: { nameAtTime: string; quantity: number; note: string | null; modifiers: { nameAtTime: string }[] }[];
};

function shape(o: Row, extra: { prepMinutes: number | null; cancelReason: string | null; scheduledFor: string | null }): MerchantOrder {
  return {
    id: o.id,
    ref: `#${o.id.slice(0, 8).toUpperCase()}`,
    orderNumber: o.orderNumber != null ? formatOrderNumber(o.orderNumber) : null,
    orderType: o.orderType,
    status: o.status,
    deliveryStatus: o.deliveryStatus,
    paymentStatus: o.paymentStatus,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerAddress: o.customerAddress,
    total: o.total,
    prepMinutes: extra.prepMinutes,
    cancelReason: extra.cancelReason,
    scheduledFor: extra.scheduledFor,
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((it) => ({
      name: it.nameAtTime,
      quantity: it.quantity,
      note: it.note,
      modifiers: it.modifiers.map((m) => m.nameAtTime),
    })),
  };
}

/** All of this restaurant's online orders, bucketed for the merchant screen. */
export async function getMerchantOrders(): Promise<MerchantData> {
  const staff = await requireStaff(MERCHANT_ROLES);
  return loadMerchantData(staff.restaurantId);
}

async function loadMerchantData(restaurantId: string): Promise<MerchantData> {
  const [incomingRows, activeRows, historyRows] = await tenantDb(restaurantId, async (tx) => {
    const online = { tableId: null }; // online orders never have a table
    return Promise.all([
      tx.order.findMany({
        where: { ...online, status: "pending" },
        orderBy: { createdAt: "asc" },
        select: ITEM_SELECT,
      }),
      tx.order.findMany({
        where: { ...online, status: { in: ["new", "preparing", "done"] } },
        orderBy: { createdAt: "asc" },
        select: ITEM_SELECT,
      }),
      tx.order.findMany({
        where: { ...online, status: { in: ["closed", "cancelled"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: ITEM_SELECT,
      }),
    ]);
  });

  // prepMinutes / cancelReason are newer columns — read them best-effort so the
  // screen still works before the migration runs.
  const allIds = [...incomingRows, ...activeRows, ...historyRows].map((o) => o.id);
  const extras = await loadExtras(restaurantId, allIds);
  const get = (id: string) => extras.get(id) ?? { prepMinutes: null, cancelReason: null, scheduledFor: null };

  return {
    incoming: incomingRows.map((o) => shape(o as Row, get(o.id))),
    active: activeRows.map((o) => shape(o as Row, get(o.id))),
    history: historyRows.map((o) => shape(o as Row, get(o.id))),
  };
}

type OrderExtra = { prepMinutes: number | null; cancelReason: string | null; scheduledFor: string | null };

async function loadExtras(restaurantId: string, ids: string[]): Promise<Map<string, OrderExtra>> {
  const map = new Map<string, OrderExtra>();
  if (ids.length === 0) return map;
  // prepMinutes / cancelReason and (newer) scheduledFor may lag. Try the full set
  // first, then fall back to just prepMinutes/cancelReason so a missing
  // scheduledFor column doesn't drop the other extras.
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, prepMinutes: true, cancelReason: true, scheduledFor: true },
      }),
    );
    for (const r of rows) map.set(r.id, { prepMinutes: r.prepMinutes ?? null, cancelReason: r.cancelReason ?? null, scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null });
    return map;
  } catch {
    /* scheduledFor column not migrated yet — fall through */
  }
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: ids } },
        select: { id: true, prepMinutes: true, cancelReason: true },
      }),
    );
    for (const r of rows) map.set(r.id, { prepMinutes: r.prepMinutes ?? null, cancelReason: r.cancelReason ?? null, scheduledFor: null });
  } catch {
    /* prepMinutes/cancelReason not migrated yet either */
  }
  return map;
}

export interface MerchantActionResult {
  ok: boolean;
  error?: string;
  data?: MerchantData;
}

/** Accept an incoming order (pending → new). Optionally records a prep ETA. */
export async function acceptMerchantOrder(
  orderId: string,
  prepMinutes?: number | null,
): Promise<MerchantActionResult> {
  let staff;
  try {
    staff = await requireStaff(MERCHANT_ROLES);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  // Guarded by status so two tablets can't accept the same order twice.
  const res = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "new" } }),
  );
  if (res.count === 0) {
    return { ok: false, error: "That order was already handled.", data: await loadMerchantData(staff.restaurantId) };
  }

  // Best-effort prep ETA (column may lag) — never blocks acceptance.
  const eta = prepMinutes != null && Number.isFinite(prepMinutes) ? Math.max(0, Math.min(240, Math.round(prepMinutes))) : null;
  if (eta != null) {
    try {
      await tenantDb(staff.restaurantId, (tx) =>
        tx.order.updateMany({ where: { id: orderId }, data: { prepMinutes: eta } }),
      );
    } catch {
      /* prepMinutes not migrated yet */
    }
  }

  await notifyOrdersChanged(staff.restaurantId); // → customer live tracker updates

  // Printing is driven from the merchant screen's "auto-print on accept" toggle
  // (it calls printKitchenTicket → runPrintDispatch, which covers every
  // transport), so there's no server-side print here — avoids a double print.
  return { ok: true, data: await loadMerchantData(staff.restaurantId) };
}

/** Reject an incoming order (pending → cancelled) with a mandatory reason. */
export async function rejectMerchantOrder(
  orderId: string,
  reason: RejectReason,
): Promise<MerchantActionResult> {
  let staff;
  try {
    staff = await requireStaff(MERCHANT_ROLES);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  if (!REJECT_REASONS.includes(reason)) return { ok: false, error: "Pick a reason." };

  const res = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.updateMany({ where: { id: orderId, status: "pending" }, data: { status: "cancelled" } }),
  );
  if (res.count === 0) {
    return { ok: false, error: "That order was already handled.", data: await loadMerchantData(staff.restaurantId) };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.order.updateMany({ where: { id: orderId }, data: { cancelReason: reason } }),
    );
  } catch {
    /* cancelReason not migrated yet */
  }
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, data: await loadMerchantData(staff.restaurantId) };
}

export type MerchantAdvance = "preparing" | "ready" | "out_for_delivery" | "delivered" | "completed";

/**
 * Advance an accepted order along the shared lifecycle. Each step is guarded by
 * the current status so it's idempotent, and every step pings realtime so the
 * customer's tracker reflects it.
 *   preparing:        new        → preparing
 *   ready:            preparing  → done (+ deduct inventory, as the kitchen does)
 *   out_for_delivery: done       → done + deliveryStatus=out_for_delivery
 *   delivered:        done       → closed + paid + deliveryStatus=delivered
 *   completed:        done       → closed + paid (pickup handed off)
 */
export async function advanceMerchantOrder(
  orderId: string,
  to: MerchantAdvance,
): Promise<MerchantActionResult> {
  let staff;
  try {
    staff = await requireStaff(MERCHANT_ROLES);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const rid = staff.restaurantId;

  let changed = 0;
  if (to === "preparing") {
    changed = (await tenantDb(rid, (tx) =>
      tx.order.updateMany({ where: { id: orderId, status: "new" }, data: { status: "preparing" } }),
    )).count;
  } else if (to === "ready") {
    changed = (await tenantDb(rid, (tx) =>
      tx.order.updateMany({ where: { id: orderId, status: "preparing" }, data: { status: "done" } }),
    )).count;
    if (changed > 0) {
      try {
        await deductForOrder(rid, orderId); // same stock deduction as the kitchen's "done"
      } catch {
        /* inventory module optional / not configured */
      }
    }
  } else if (to === "out_for_delivery") {
    changed = (await tenantDb(rid, (tx) =>
      tx.order.updateMany({
        where: { id: orderId, status: "done" },
        data: { deliveryStatus: "out_for_delivery" },
      }),
    )).count;
  } else if (to === "delivered") {
    changed = (await tenantDb(rid, (tx) =>
      tx.order.updateMany({
        where: { id: orderId, status: "done" },
        data: { status: "closed", paymentStatus: "paid", deliveryStatus: "delivered" },
      }),
    )).count;
  } else if (to === "completed") {
    changed = (await tenantDb(rid, (tx) =>
      tx.order.updateMany({
        where: { id: orderId, status: "done" },
        data: { status: "closed", paymentStatus: "paid" },
      }),
    )).count;
  }

  if (changed > 0) await notifyOrdersChanged(rid);
  return { ok: true, data: await loadMerchantData(rid) };
}

/**
 * Create a clearly-labelled TEST online order so staff can verify the alarm,
 * the accept/reject flow and the customer tracker end-to-end on the tablet. It
 * goes through the real Order model (pending, no table) so it behaves exactly
 * like a genuine online order — just reject it afterwards to clear it.
 */
export async function createTestOrder(): Promise<MerchantActionResult> {
  let staff;
  try {
    staff = await requireStaff(MERCHANT_ROLES);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const rid = staff.restaurantId;

  // Use a real menu item (FK requirement) — the first one we can find.
  const item = await tenantDb(rid, (tx) =>
    tx.menuItem.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, price: true } }),
  );
  if (!item) {
    return { ok: false, error: "Add at least one menu item first, then send a test order." };
  }

  try {
    await tenantDb(rid, (tx) =>
      tx.order.create({
        data: {
          restaurantId: rid,
          status: "pending",
          paymentStatus: "unpaid",
          orderType: "takeout",
          customerName: "🧪 TEST ORDER — please reject",
          customerPhone: "0000000000",
          total: item.price,
          items: { create: [{ menuItemId: item.id, nameAtTime: item.name, quantity: 1, unitPrice: item.price }] },
        },
        select: { id: true },
      }),
    );
  } catch {
    return { ok: false, error: "Couldn't create the test order. Please try again." };
  }

  await notifyOrdersChanged(rid); // fires the alarm just like a real order
  return { ok: true, data: await loadMerchantData(rid) };
}
