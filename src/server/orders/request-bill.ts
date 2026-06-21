"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged, notifyBillRequest } from "@/server/realtime/notify";

const schema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
  method: z.enum(["cash", "online"]).optional(),
});

/** Resolve a table from the public slug + token (no session). */
async function resolveTable(slug: string, tableToken: string) {
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug, status: "active" },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true, tableNumber: true },
    });
    if (!table) return null;
    return { restaurantId: restaurant.id, tableId: table.id, tableNumber: table.tableNumber };
  });
}

export interface TableBill {
  items: { name: string; quantity: number; lineTotal: number }[];
  subtotal: number; // centavos, gross (before any discount)
  discount: number; // centavos taken off
  discountLabel: string | null; // e.g. "Promo SAVE20 · 20% off"
  total: number; // centavos, net payable (subtotal − discount)
  orderCount: number;
}

/** The diner's current (outstanding) bill for their table — itemized + total. */
export async function getTableBill(input: {
  slug: string;
  tableToken: string;
}): Promise<{ ok: boolean; bill?: TableBill; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await resolveTable(parsed.data.slug, parsed.data.tableToken);
  if (!ctx) return { ok: false, error: "Table unavailable." };

  const orders = await tenantDb(ctx.restaurantId, (tx) =>
    tx.order.findMany({
      where: {
        tableId: ctx.tableId,
        status: { in: ["new", "preparing", "done"] },
        paymentStatus: { in: ["unpaid", "failed"] },
      },
      select: {
        total: true,
        discountAmount: true,
        discountLabel: true,
        items: {
          select: {
            quantity: true,
            nameAtTime: true,
            unitPrice: true,
            modifiers: { select: { priceDeltaAtTime: true } },
          },
        },
      },
    }),
  );

  const items: TableBill["items"] = [];
  let subtotal = 0;
  let discount = 0;
  let discountLabel: string | null = null;
  for (const o of orders) {
    subtotal += o.total;
    discount += o.discountAmount ?? 0;
    if (o.discountLabel) discountLabel = o.discountLabel;
    for (const i of o.items) {
      const unit = i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0);
      items.push({ name: i.nameAtTime, quantity: i.quantity, lineTotal: unit * i.quantity });
    }
  }

  const total = Math.max(0, subtotal - discount);
  return { ok: true, bill: { items, subtotal, discount, discountLabel, total, orderCount: orders.length } };
}

/**
 * Diner-triggered "request the bill". No session — authorized by the table
 * token in the URL. Flags every open order at the table so the cashier board
 * lights up, then pings the live screens. When `method` is given (the diner
 * chose how to pay), staff get a popup — cash means a waiter must collect.
 */
export async function requestBill(input: {
  slug: string;
  tableToken: string;
  method?: "cash" | "online";
}): Promise<{ ok: boolean; flagged?: number; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await resolveTable(parsed.data.slug, parsed.data.tableToken);
  if (!ctx) return { ok: false, error: "Table unavailable." };

  const result = await tenantDb(ctx.restaurantId, (tx) =>
    tx.order.updateMany({
      where: {
        tableId: ctx.tableId,
        status: { in: ["new", "preparing", "done"] },
      },
      data: { billRequested: true },
    }),
  );

  if (result.count === 0) {
    return { ok: false, error: "No open orders to bill yet." };
  }

  await notifyOrdersChanged(ctx.restaurantId);
  if (parsed.data.method) {
    await notifyBillRequest(ctx.restaurantId, ctx.tableNumber, parsed.data.method);
  }
  return { ok: true, flagged: result.count };
}
