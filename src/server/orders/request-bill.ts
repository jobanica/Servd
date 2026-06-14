"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";

const schema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
});

/**
 * Diner-triggered "request the bill". No session — authorized by the table
 * token in the URL. Flags every open order at the table so the cashier board
 * lights up, then pings the live screens.
 */
export async function requestBill(input: {
  slug: string;
  tableToken: string;
}): Promise<{ ok: boolean; flagged?: number; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug: parsed.data.slug, status: "active" },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: parsed.data.tableToken },
      select: { id: true },
    });
    if (!table) return null;
    return { restaurantId: restaurant.id, tableId: table.id };
  });
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
  return { ok: true, flagged: result.count };
}
