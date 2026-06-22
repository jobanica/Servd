import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { unitPrice, validateSelection } from "@/lib/cart/pricing";
import type { DinerItem, Selection } from "@/lib/cart/types";

/**
 * Shared, server-side order validation + pricing. Both the diner (`placeOrder`)
 * and the cashier POS (`createCashierOrder`) build orders through here so the
 * money rules live in exactly one place.
 *
 * SECURITY: the caller only sends item ids + quantities + chosen modifier ids.
 * We load the REAL menu items from the DB, re-run the same validation as the
 * cart, recompute every price, and snapshot names + prices onto the order so it
 * stays correct even if the menu changes later.
 */

export interface OrderLineInput {
  itemId: string;
  quantity: number;
  note?: string | null;
  modifierIds: string[];
}

export interface BuiltOrderItem {
  menuItemId: string;
  nameAtTime: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  modifiers: { modifierId: string; nameAtTime: string; priceDeltaAtTime: number }[];
}

export interface BuiltOrder {
  total: number;
  items: BuiltOrderItem[];
}

/** Thrown when the submitted lines fail validation (sold out, bad modifier…). */
export class OrderValidationError extends Error {}

export async function buildValidatedOrder(
  restaurantId: string,
  lines: OrderLineInput[],
): Promise<BuiltOrder> {
  if (!lines.length) throw new OrderValidationError("Your order is empty.");

  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const dbItems = await tenantDb(restaurantId, (tx) =>
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

  let total = 0;
  const items: BuiltOrderItem[] = [];

  for (const line of lines) {
    const dbItem = itemMap.get(line.itemId);
    if (!dbItem) throw new OrderValidationError("An item is no longer on the menu.");
    if (!dbItem.isAvailable) throw new OrderValidationError(`"${dbItem.name}" is sold out.`);

    const dinerItem: DinerItem = {
      id: dbItem.id,
      name: dbItem.name,
      description: dbItem.description,
      price: dbItem.price,
      imageUrl: dbItem.imageUrl,
      videoUrl: dbItem.videoUrl,
      videoPosterUrl: dbItem.videoPosterUrl,
      isAvailable: dbItem.isAvailable,
      dietaryTags: dbItem.dietaryTags ?? [],
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

    // Map flat modifier ids back to their groups; reject anything foreign.
    const selection: Selection = {};
    const chosen: { modifierId: string; nameAtTime: string; priceDeltaAtTime: number }[] = [];
    for (const modId of line.modifierIds) {
      const group = dinerItem.groups.find((g) => g.modifiers.some((m) => m.id === modId));
      const mod = group?.modifiers.find((m) => m.id === modId);
      if (!group || !mod) throw new OrderValidationError("An option is no longer available.");
      (selection[group.id] ??= []).push(modId);
      chosen.push({ modifierId: mod.id, nameAtTime: mod.name, priceDeltaAtTime: mod.priceDelta });
    }

    const ruleError = validateSelection(dinerItem, selection);
    if (ruleError) throw new OrderValidationError(ruleError);

    const linePrice = unitPrice(dinerItem, selection);
    total += linePrice * line.quantity;

    items.push({
      menuItemId: dbItem.id,
      nameAtTime: dbItem.name,
      quantity: line.quantity,
      unitPrice: dbItem.price, // base snapshot; deltas live on modifiers
      note: line.note ?? null,
      modifiers: chosen,
    });
  }

  return { total, items };
}

/** Prisma-shaped nested create for an order's items. */
export function orderItemsCreate(items: BuiltOrderItem[]) {
  return items.map((oi) => ({
    menuItemId: oi.menuItemId,
    nameAtTime: oi.nameAtTime,
    quantity: oi.quantity,
    unitPrice: oi.unitPrice,
    note: oi.note,
    modifiers: { create: oi.modifiers },
  }));
}
