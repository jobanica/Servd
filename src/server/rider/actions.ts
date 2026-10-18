"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { awardPointsForOrder } from "@/server/loyalty/loyalty";
import { notifyCustomer, restaurantDisplayName } from "@/server/sms/notify";
import { uploadRiderReceipt, signRiderReceipts } from "@/server/storage/rider-receipts";
import { startOfManilaDay } from "@/lib/orders/order-number";
import { batchLabelFromInstants, isAsapAddress, stripBatchTag } from "@/lib/orders/delivery-windows";
import {
  amountDue,
  isRiderPayMethod,
  riderStage,
  summarizeDeliveries,
  PICKUP_STATUSES,
  type DaySummary,
  type RiderStage,
} from "@/lib/rider/rider";

/**
 * The Rider app. A rider sees every delivery order the shop has going today,
 * takes one, and hands it over — recording how the customer paid at the door.
 * The shop's owner can open it too (to try it, or to cover a run themselves).
 */

const RIDER_ROLES = ["rider", "admin"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RiderOrder {
  id: string;
  ref: string; // #ABC12345
  stage: RiderStage;
  mine: boolean;
  riderName: string | null; // who has it, when someone does
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  items: { name: string; quantity: number }[];
  due: number; // centavos still to collect (0 when paid already)
  paid: boolean; // paid online before delivery
  paymentChoice: string | null; // what the customer chose at checkout: "cod" | "gcash" | …
  cashTendered: number | null;
  when: string | null; // "⚡ ASAP", "11:00–11:30 AM" or a scheduled time
  createdAt: string;
}

export interface RiderDelivery {
  id: string;
  ref: string;
  customerName: string | null;
  address: string | null;
  deliveredAt: string;
  method: string; // cash | gcash | prepaid
  collected: number;
  receiptUrl: string | null;
}

export interface RiderBoard {
  orders: RiderOrder[];
  today: DaySummary;
  deliveries: RiderDelivery[];
}

type Result = { ok: true; board: RiderBoard } | { ok: false; error: string };

async function rider() {
  return requireStaff([...RIDER_ROLES]);
}

const shortRef = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

function whenLabel(o: {
  customerAddress: string | null;
  deliveryWindowStart: Date | null;
  deliveryWindowEnd: Date | null;
  scheduledFor: Date | null;
}): string | null {
  if (isAsapAddress(o.customerAddress)) return "⚡ ASAP";
  if (o.deliveryWindowStart && o.deliveryWindowEnd) {
    return batchLabelFromInstants(o.deliveryWindowStart, o.deliveryWindowEnd);
  }
  if (o.scheduledFor) {
    return o.scheduledFor.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
  }
  return null;
}

/** Address without the tags the order path adds for the kitchen ("[Deliver …]", "[ASAP …]"). */
function cleanAddress(a: string | null): string | null {
  if (!a) return null;
  return stripBatchTag(a).replace(/\[ASAP[^\]]*\]\s*/g, "").trim() || null;
}

async function staffNames(restaurantId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await tenantDb(restaurantId, (tx) =>
    tx.staffUser.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, email: true } }),
  );
  return new Map(rows.map((r) => [r.id, r.displayName?.trim() || r.email.split("@")[0]]));
}

/** Everything the Rider app shows: today's delivery orders and this rider's day. */
export async function getRiderBoard(): Promise<RiderBoard> {
  const me = await rider();
  const dayStart = startOfManilaDay();
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const [rows, done] = await tenantDb(me.restaurantId, (tx) =>
    Promise.all([
      tx.order.findMany({
        where: {
          orderType: "delivery",
          status: { in: [...PICKUP_STATUSES] },
          // Not orders booked for another day: those wait on the advance list.
          OR: [{ scheduledFor: null }, { scheduledFor: { lt: dayEnd } }],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          deliveryStatus: true,
          riderId: true,
          customerName: true,
          customerPhone: true,
          customerAddress: true,
          customerLat: true,
          customerLng: true,
          customerNote: true,
          total: true,
          discountAmount: true,
          creditApplied: true,
          paymentStatus: true,
          paymentChoice: true,
          cashTendered: true,
          scheduledFor: true,
          deliveryWindowStart: true,
          deliveryWindowEnd: true,
          createdAt: true,
          items: { select: { nameAtTime: true, quantity: true } },
        },
      }),
      tx.order.findMany({
        where: { riderId: me.staffUserId, deliveredAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { deliveredAt: "desc" },
        select: {
          id: true,
          customerName: true,
          customerAddress: true,
          deliveredAt: true,
          riderPayMethod: true,
          riderCollected: true,
          riderReceiptPath: true,
        },
      }),
    ]),
  );

  const names = await staffNames(
    me.restaurantId,
    rows.map((r) => r.riderId).filter((x): x is string => !!x),
  );
  const signed = await signRiderReceipts(me.restaurantId, done.map((d) => d.riderReceiptPath));

  // A delivery taken by another rider shows as theirs (mine: false).
  const orders: RiderOrder[] = rows.map((o) => {
    const paid = o.paymentStatus === "paid";
    return {
      id: o.id,
      ref: shortRef(o.id),
      stage: riderStage(o),
      mine: o.riderId === me.staffUserId,
      riderName: o.riderId ? names.get(o.riderId) ?? "Another rider" : null,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      address: cleanAddress(o.customerAddress),
      lat: o.customerLat,
      lng: o.customerLng,
      note: o.customerNote,
      items: o.items.map((i) => ({ name: i.nameAtTime, quantity: i.quantity })),
      due: paid ? 0 : amountDue(o),
      paid,
      paymentChoice: o.paymentChoice,
      cashTendered: o.cashTendered,
      when: whenLabel(o),
      createdAt: o.createdAt.toISOString(),
    };
  });

  return {
    orders,
    today: summarizeDeliveries(done),
    deliveries: done.map((d) => ({
      id: d.id,
      ref: shortRef(d.id),
      customerName: d.customerName,
      address: cleanAddress(d.customerAddress),
      deliveredAt: (d.deliveredAt ?? new Date()).toISOString(),
      method: d.riderPayMethod ?? "prepaid",
      collected: d.riderCollected ?? 0,
      receiptUrl: d.riderReceiptPath ? signed.get(d.riderReceiptPath) ?? null : null,
    })),
  };
}

async function board(): Promise<Result> {
  try {
    return { ok: true, board: await getRiderBoard() };
  } catch {
    return { ok: false, error: "Couldn't refresh. Pull down or try again." };
  }
}

/** Take an order out for delivery. First rider to tap gets it. */
export async function pickUpOrder(orderId: string): Promise<Result> {
  let me;
  try {
    me = await rider();
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const taken = await tenantDb(me.restaurantId, async (tx) => {
    const r = await tx.order.updateMany({
      where: {
        id: orderId,
        orderType: "delivery",
        status: { in: [...PICKUP_STATUSES] },
        OR: [{ riderId: null }, { riderId: me.staffUserId }],
      },
      // Leaving with it means the kitchen is finished with it.
      data: { riderId: me.staffUserId, riderPickedUpAt: new Date(), deliveryStatus: "out_for_delivery", status: "done" },
    });
    if (r.count === 0) return null;
    return tx.order.findFirst({ where: { id: orderId }, select: { customerName: true, customerPhone: true } });
  });
  if (!taken) return { ok: false, error: "Another rider already took this order." };

  if (taken.customerPhone) {
    const who = await restaurantDisplayName(me.restaurantId);
    const name = taken.customerName ? `Hi ${taken.customerName}, ` : "";
    await notifyCustomer(me.restaurantId, taken.customerPhone, `${name}your order from ${who} is on the way! 🛵`);
  }
  await notifyOrdersChanged(me.restaurantId);
  return board();
}

/** Put an order back, when it was taken by mistake. Only the rider who has it. */
export async function releaseOrder(orderId: string): Promise<Result> {
  let me;
  try {
    me = await rider();
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  await tenantDb(me.restaurantId, (tx) =>
    tx.order.updateMany({
      where: { id: orderId, riderId: me.staffUserId, deliveryStatus: "out_for_delivery", status: { in: [...PICKUP_STATUSES] } },
      data: { riderId: null, riderPickedUpAt: null, deliveryStatus: null },
    }),
  );
  await notifyOrdersChanged(me.restaurantId);
  return board();
}

/**
 * Hand the order over and record how it was paid at the door.
 *
 *  cash    — the rider collected the amount due in cash.
 *  gcash   — the customer paid by GCash; a photo of the receipt is required.
 *  prepaid — it was paid online already; nothing to collect.
 *
 * The amount is always the server's figure, never the phone's. The payment is
 * booked under the rider, so the shop's accounting and the rider's day agree.
 */
export async function markRiderDelivered(input: {
  orderId: string;
  method: string;
  receipt?: string | null; // data URL, GCash only
}): Promise<Result> {
  let me;
  try {
    me = await rider();
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  const method = input.method;
  if (!isRiderPayMethod(method)) return { ok: false, error: "Choose how the customer paid." };

  const order = await tenantDb(me.restaurantId, (tx) =>
    tx.order.findFirst({
      where: { id: input.orderId, orderType: "delivery" },
      select: {
        status: true,
        riderId: true,
        paymentStatus: true,
        total: true,
        discountAmount: true,
        creditApplied: true,
        customerPhone: true,
      },
    }),
  );
  if (!order) return { ok: false, error: "Order not found." };
  if (!(PICKUP_STATUSES as readonly string[]).includes(order.status)) {
    return { ok: false, error: "This order is already closed." };
  }
  if (order.riderId && order.riderId !== me.staffUserId && me.role !== "admin") {
    return { ok: false, error: "Another rider has this order." };
  }

  const paidAlready = order.paymentStatus === "paid";
  if (method === "prepaid" && !paidAlready) {
    return { ok: false, error: "This order isn't paid yet. Choose Cash or GCash." };
  }
  // Paid online already: there is nothing to collect, whatever was tapped.
  const effective = paidAlready ? "prepaid" : method;
  const due = paidAlready ? 0 : amountDue(order);

  let receiptPath: string | null = null;
  if (effective === "gcash") {
    if (!input.receipt) return { ok: false, error: "Take a photo of the GCash receipt first." };
    try {
      receiptPath = await uploadRiderReceipt(me.restaurantId, input.receipt);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't upload the photo." };
    }
  }

  const now = new Date();
  const closed = await tenantDb(me.restaurantId, async (tx) => {
    const r = await tx.order.updateMany({
      where: {
        id: input.orderId,
        status: { in: [...PICKUP_STATUSES] },
        ...(me.role === "admin" ? {} : { OR: [{ riderId: null }, { riderId: me.staffUserId }] }),
      },
      data: {
        status: "closed",
        paymentStatus: "paid",
        deliveryStatus: "delivered",
        billRequested: false,
        riderId: me.staffUserId,
        deliveredAt: now,
        riderPayMethod: effective,
        riderCollected: due,
        riderReceiptPath: receiptPath,
      },
    });
    if (r.count === 0) return false;
    if (due > 0) {
      const existing = await tx.payment.findFirst({ where: { orderId: input.orderId, status: "paid" }, select: { id: true } });
      if (!existing) {
        await tx.payment.create({
          data: {
            orderId: input.orderId,
            amount: due,
            method: effective === "gcash" ? "gcash" : "cash",
            gateway: "manual",
            gatewayRef: effective === "gcash" ? "rider-receipt" : null,
            status: "paid",
            staffUserId: me.staffUserId,
          },
        });
      }
    }
    return true;
  });
  if (!closed) return { ok: false, error: "This order was just closed by someone else." };

  await awardPointsForOrder(me.restaurantId, input.orderId, amountDue(order), order.customerPhone);
  if (order.customerPhone) {
    const who = await restaurantDisplayName(me.restaurantId);
    await notifyCustomer(me.restaurantId, order.customerPhone, `Your order from ${who} has been delivered. Thank you, and enjoy! 🙏`);
  }
  await notifyOrdersChanged(me.restaurantId);
  return board();
}

/** Re-read the board (the app's refresh and poll). */
export async function refreshRiderBoard(): Promise<Result> {
  try {
    await rider();
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  return board();
}
