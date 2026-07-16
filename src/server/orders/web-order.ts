"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
} from "@/server/orders/build-order";
import { recordServingsSold } from "@/server/menu/servings";
import { recordVariantsSold } from "@/server/menu/variants";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { getPublicStorefront, isOpenNow, computeDownpayment } from "@/server/storefront/storefront";
import { getLoyaltyConfig, enrollAccount } from "@/server/loyalty/loyalty";
import { markCartConverted } from "@/server/marketing/cart-recovery";
import { formatPeso } from "@/lib/money";

const schema = z.object({
  slug: z.string().min(1),
  orderType: z.enum(["takeout", "delivery"]),
  customerName: z.string().trim().min(1, "Enter your name").max(80),
  customerPhone: z.string().trim().min(7, "Enter your phone number").max(30),
  customerAddress: z.string().trim().max(300).optional(),
  deliveryZone: z.string().trim().max(80).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  scheduledFor: z.string().datetime().optional(), // ISO; advance order (null = ASAP)
  downpaymentRef: z.string().trim().max(120).optional(), // customer's payment reference
  paymentChoice: z.enum(["cod", "gcash"]).optional(), // chosen payment method
  paymentRef: z.string().trim().max(120).optional(), // GCash reference for the full payment
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(99),
        note: z.string().trim().max(200).optional(),
        modifierIds: z.array(z.string().uuid()).max(50).default([]),
        variantId: z.string().uuid().optional(),
      }),
    )
    .min(1, "Your cart is empty")
    .max(100),
});

export type WebOrderInput = z.infer<typeof schema>;
export type WebOrderResult =
  | { ok: true; orderId: string; awaitingApproval: boolean; downpaymentAmount: number }
  | { ok: false; error: string };

/**
 * Places an online (website) order for pickup or delivery — no table. Lands as
 * `pending` so the cashier confirms it (incoming-order popup), then it flows
 * through the same kitchen/cashier pipeline as everything else.
 */
export async function placeWebOrder(input: WebOrderInput): Promise<WebOrderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  }
  const d = parsed.data;
  if (d.orderType === "delivery" && !d.customerAddress?.trim()) {
    return { ok: false, error: "A delivery address is required." };
  }
  if (d.orderType === "delivery" && (d.lat == null || d.lng == null)) {
    return { ok: false, error: "Please pin your delivery location on the map." };
  }

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug: d.slug, status: "active" }, select: { id: true } }),
  );
  if (!restaurant) return { ok: false, error: "This restaurant is unavailable." };

  // Validate an advance-order time, if one was chosen.
  let scheduledFor: Date | null = null;
  if (d.scheduledFor) {
    const when = new Date(d.scheduledFor);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "That schedule time didn't look right." };
    if (when.getTime() < Date.now() + 15 * 60 * 1000) {
      return { ok: false, error: "Please schedule at least 15 minutes from now." };
    }
    if (when.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
      return { ok: false, error: "Orders can be scheduled up to 90 days ahead." };
    }
    scheduledFor = when;
  }

  const storefront = await getPublicStorefront(restaurant.id);
  // A "closed now" store still takes ADVANCE orders (they're for later) — only
  // block ASAP orders when the owner pauses ordering outside opening hours.
  if (!scheduledFor && storefront.pauseWhenClosed && !isOpenNow(storefront.hours)) {
    return { ok: false, error: "We're currently closed. Please order during store hours, or schedule your order for later." };
  }

  let built;
  try {
    built = await buildValidatedOrder(restaurant.id, d.lines);
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "We couldn't build your order. Please try again." };
  }

  // Delivery fee — looked up server-side from the restaurant's zones (never
  // trust the client for money). Encoded into the address so staff see it.
  let deliveryFee = 0;
  let addressLine: string | null = null;
  if (d.orderType === "delivery") {
    const zone = d.deliveryZone ? storefront.zones.find((z) => z.name === d.deliveryZone) : undefined;
    deliveryFee = zone?.fee ?? 0;
    const prefix = zone ? `[${zone.name}${deliveryFee > 0 ? ` · delivery ${formatPeso(deliveryFee)}` : ""}] ` : "";
    addressLine = `${prefix}${d.customerAddress?.trim() ?? ""}`.trim() || null;
  }

  const base = {
    restaurantId: restaurant.id,
    orderType: d.orderType,
    customerName: d.customerName.trim(),
    customerPhone: d.customerPhone.replace(/[^\d+]/g, ""),
    customerAddress: addressLine,
    status: "pending" as const,
    paymentStatus: "unpaid" as const,
    total: built.total + deliveryFee,
    items: { create: orderItemsCreate(built.items) },
  };
  // Optional columns that a schema-lagged DB may not have yet (geo pin, advance
  // schedule, approval/downpayment). Tried together first, then dropped on error
  // so the order still lands.
  const geo = d.orderType === "delivery" && d.lat != null && d.lng != null ? { customerLat: d.lat, customerLng: d.lng } : null;
  const sched = scheduledFor ? { scheduledFor } : null;
  // Every advance order needs the owner's approval; downpayment is recomputed
  // server-side (never trust the client for money).
  const advance = scheduledFor
    ? {
        approvalStatus: "awaiting",
        downpaymentAmount: computeDownpayment(storefront.booking, base.total) || null,
        downpaymentRef: d.downpaymentRef?.trim() || null,
      }
    : null;
  // Payment method (cash / GCash). GCash must be enabled by the owner; unknown or
  // disabled choices fall back to cash so an order never gets stuck.
  const choice = d.paymentChoice === "gcash" && storefront.payment.gcashEnabled ? "gcash" : "cod";
  const pay = { paymentChoice: choice, paymentRef: choice === "gcash" ? d.paymentRef?.trim() || null : null };
  const extra = { ...(geo ?? {}), ...(sched ?? {}), ...(advance ?? {}), ...pay };

  let order;
  try {
    order = await tenantDb(restaurant.id, (tx) =>
      tx.order.create({ data: Object.keys(extra).length ? { ...base, ...extra } : base, select: { id: true } }),
    );
  } catch (e) {
    // customerLat/Lng/scheduledFor columns may lag — retry with the base fields only.
    if (Object.keys(extra).length) {
      try {
        order = await tenantDb(restaurant.id, (tx) => tx.order.create({ data: base, select: { id: true } }));
      } catch (e2) {
        console.error("placeWebOrder failed", e2);
        return { ok: false, error: "We couldn't place your order. Please try again." };
      }
    } else {
      console.error("placeWebOrder failed", e);
      return { ok: false, error: "We couldn't place your order. Please try again." };
    }
  }

  // Count these servings toward each item's daily cap (best-effort, own tx).
  await recordServingsSold(restaurant.id, built.items);
  await recordVariantsSold(
    restaurant.id,
    built.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
  );

  await notifyOrdersChanged(restaurant.id);

  // The cart converted — close any open abandoned-cart lead for this phone.
  await markCartConverted(restaurant.id, d.customerPhone);

  // Auto-enroll the customer into loyalty (they gave name + phone). Best-effort.
  try {
    const cfg = await getLoyaltyConfig(restaurant.id);
    if (cfg.enabled) await enrollAccount(restaurant.id, d.customerPhone, d.customerName);
  } catch {
    /* loyalty must never block the order */
  }

  return {
    ok: true,
    orderId: order.id,
    awaitingApproval: !!scheduledFor,
    downpaymentAmount: advance?.downpaymentAmount ?? 0,
  };
}
