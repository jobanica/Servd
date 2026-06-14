"use server";

import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import {
  placeOrderSchema,
  type PlaceOrderInput,
  type PlaceOrderResult,
} from "@/lib/validation/order";
import { unitPrice, validateSelection } from "@/lib/cart/pricing";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { autoPrintIfEnabled } from "@/server/printing/print";
import type { DinerItem, Selection } from "@/lib/cart/types";

/**
 * Creates an order from a diner's cart. Diners have no session — the order is
 * authorized purely by the table token in the URL.
 *
 * SECURITY: the client is never trusted for money. We load the real menu items
 * and modifiers from the DB, re-run the SAME validation as the cart, recompute
 * every price, and snapshot names + prices onto the order so it stays correct if
 * the menu later changes.
 */
export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  }
  const { slug, tableToken, lines } = parsed.data;

  // Resolve the restaurant + table (public lookups, scoped by slug/token).
  const ctx = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug, status: "active" },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true },
    });
    if (!table) return null;
    return { restaurantId: restaurant.id, tableId: table.id };
  });
  if (!ctx) return { ok: false, error: "This table or restaurant is unavailable." };

  // Load every referenced item with its attached modifier groups + options.
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const dbItems = await tenantDb(ctx.restaurantId, (tx) =>
    tx.menuItem.findMany({
      where: { id: { in: itemIds } },
      include: {
        modifierGroups: {
          orderBy: { sortOrder: "asc" },
          include: { group: { include: { modifiers: true } } },
        },
      },
    }),
  );
  const itemMap = new Map(dbItems.map((i) => [i.id, i]));

  // Build the order's line data, validating + pricing each line server-side.
  let total = 0;
  const orderItemsData: {
    menuItemId: string;
    nameAtTime: string;
    quantity: number;
    unitPrice: number;
    note: string | null;
    modifiers: { modifierId: string; nameAtTime: string; priceDeltaAtTime: number }[];
  }[] = [];

  for (const line of lines) {
    const dbItem = itemMap.get(line.itemId);
    if (!dbItem) return { ok: false, error: "An item is no longer on the menu." };
    if (!dbItem.isAvailable) {
      return { ok: false, error: `"${dbItem.name}" is sold out.` };
    }

    // Shape the DB item like a DinerItem so we can reuse the shared rules.
    const dinerItem: DinerItem = {
      id: dbItem.id,
      name: dbItem.name,
      description: dbItem.description,
      price: dbItem.price,
      imageUrl: dbItem.imageUrl,
      isAvailable: dbItem.isAvailable,
      groups: dbItem.modifierGroups.map((l) => ({
        id: l.group.id,
        name: l.group.name,
        required: l.group.required,
        minSelect: l.group.minSelect,
        maxSelect: l.group.maxSelect,
        modifiers: l.group.modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
        })),
      })),
    };

    // Map the flat modifier ids back to their groups; reject anything that
    // doesn't belong to this item's groups (tampering / stale menu).
    const selection: Selection = {};
    const chosen: { modifierId: string; nameAtTime: string; priceDeltaAtTime: number }[] = [];
    for (const modId of line.modifierIds) {
      const group = dinerItem.groups.find((g) =>
        g.modifiers.some((m) => m.id === modId),
      );
      const mod = group?.modifiers.find((m) => m.id === modId);
      if (!group || !mod) {
        return { ok: false, error: "An option is no longer available." };
      }
      (selection[group.id] ??= []).push(modId);
      chosen.push({
        modifierId: mod.id,
        nameAtTime: mod.name,
        priceDeltaAtTime: mod.priceDelta,
      });
    }

    const ruleError = validateSelection(dinerItem, selection);
    if (ruleError) return { ok: false, error: ruleError };

    const linePrice = unitPrice(dinerItem, selection); // base + deltas
    total += linePrice * line.quantity;

    orderItemsData.push({
      menuItemId: dbItem.id,
      nameAtTime: dbItem.name,
      quantity: line.quantity,
      unitPrice: dbItem.price, // base snapshot; deltas live on modifiers
      note: line.note ?? null,
      modifiers: chosen,
    });
  }

  // Persist atomically, tenant-scoped (RLS WITH CHECK enforces the boundary).
  const order = await tenantDb(ctx.restaurantId, (tx) =>
    tx.order.create({
      data: {
        restaurantId: ctx.restaurantId,
        tableId: ctx.tableId,
        status: "new",
        paymentStatus: "unpaid",
        total,
        items: {
          create: orderItemsData.map((oi) => ({
            menuItemId: oi.menuItemId,
            nameAtTime: oi.nameAtTime,
            quantity: oi.quantity,
            unitPrice: oi.unitPrice,
            note: oi.note,
            modifiers: { create: oi.modifiers },
          })),
        },
      },
      select: { id: true },
    }),
  );

  // Push the new order to the live kitchen/cashier screens.
  await notifyOrdersChanged(ctx.restaurantId);
  // Auto-print the ticket if the restaurant uses a server-driven printer.
  await autoPrintIfEnabled(ctx.restaurantId, order.id);

  return { ok: true, orderId: order.id };
}
