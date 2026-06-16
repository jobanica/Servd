"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
} from "@/server/orders/build-order";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { getPublicStorefront, isOpenNow } from "@/server/storefront/storefront";
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
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(99),
        note: z.string().trim().max(200).optional(),
        modifierIds: z.array(z.string().uuid()).max(50).default([]),
      }),
    )
    .min(1, "Your cart is empty")
    .max(100),
});

export type WebOrderInput = z.infer<typeof schema>;
export type WebOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

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

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug: d.slug, status: "active" }, select: { id: true } }),
  );
  if (!restaurant) return { ok: false, error: "This restaurant is unavailable." };

  const storefront = await getPublicStorefront(restaurant.id);
  if (storefront.pauseWhenClosed && !isOpenNow(storefront.hours)) {
    return { ok: false, error: "We're currently closed. Please order during store hours." };
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
  const geo = d.orderType === "delivery" && d.lat != null && d.lng != null ? { customerLat: d.lat, customerLng: d.lng } : null;

  let order;
  try {
    order = await tenantDb(restaurant.id, (tx) =>
      tx.order.create({ data: geo ? { ...base, ...geo } : base, select: { id: true } }),
    );
  } catch (e) {
    // customerLat/Lng columns may lag — retry without them.
    if (geo) {
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

  await notifyOrdersChanged(restaurant.id);
  return { ok: true, orderId: order.id };
}
