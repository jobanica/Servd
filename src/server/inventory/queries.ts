import { tenantDb } from "@/server/tenancy/scoped-db";

export interface ReorderSuggestion {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  costPerUnit: number;
  supplierId: string | null;
  supplierName: string | null;
  avgDailyUse: number; // rounded for display
  suggestedQty: number;
  estCost: number; // centavos
}

/**
 * Auto-reorder suggestions from usage velocity: average daily consumption over
 * the last 30 days (from `sale` stock movements) → enough to cover the next 14
 * days, topped up to at least 2× the reorder level. Only items that need
 * restocking are returned.
 */
export async function getReorderSuggestions(restaurantId: string): Promise<ReorderSuggestion[]> {
  const WINDOW_DAYS = 30;
  const TARGET_DAYS = 14;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const items = await tx.inventoryItem.findMany({
        orderBy: { name: "asc" },
        include: { supplier: { select: { name: true } } },
      });
      const moves = await tx.stockMovement.findMany({
        where: { reason: "sale", createdAt: { gte: since } },
        select: { inventoryItemId: true, changeQty: true },
      });
      const consumed = new Map<string, number>();
      for (const m of moves) {
        consumed.set(m.inventoryItemId, (consumed.get(m.inventoryItemId) ?? 0) + Math.max(0, -m.changeQty));
      }

      const out: ReorderSuggestion[] = [];
      for (const i of items) {
        const used = consumed.get(i.id) ?? 0;
        const avgDaily = used / WINDOW_DAYS;
        const targetStock = Math.max(i.reorderLevel * 2, avgDaily * TARGET_DAYS);
        const suggestedQty = Math.max(0, Math.ceil(targetStock - i.stockQty));
        if (suggestedQty <= 0) continue;
        out.push({
          id: i.id,
          name: i.name,
          unit: i.unit,
          stockQty: i.stockQty,
          reorderLevel: i.reorderLevel,
          costPerUnit: i.costPerUnit,
          supplierId: i.supplierId,
          supplierName: i.supplier?.name ?? null,
          avgDailyUse: Math.round(avgDaily * 100) / 100,
          suggestedQty,
          estCost: suggestedQty * i.costPerUnit,
        });
      }
      return out;
    });
  } catch {
    return [];
  }
}

/** Inventory items with supplier name + a low-stock flag. */
export async function listInventory(restaurantId: string) {
  const items = await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.findMany({
      orderBy: { name: "asc" },
      include: { supplier: { select: { name: true } } },
    }),
  );
  return items.map((i) => ({ ...i, low: i.stockQty <= i.reorderLevel }));
}

export function listSuppliers(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.supplier.findMany({ orderBy: { name: "asc" } }),
  );
}

export function listPurchaseOrders(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        supplier: { select: { name: true } },
        items: { select: { quantity: true, unitCost: true } },
      },
    }),
  );
}

export function getPurchaseOrder(restaurantId: string, id: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.purchaseOrder.findFirst({
      where: { id },
      include: {
        supplier: true,
        items: { include: { inventoryItem: { select: { name: true, unit: true } } } },
      },
    }),
  );
}

/** Recipe (bill of materials) for a menu item. */
export function getRecipe(restaurantId: string, menuItemId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.recipeComponent.findMany({
      where: { menuItemId },
      include: { inventoryItem: { select: { name: true, unit: true } } },
    }),
  );
}

/** COGS + top consumed ingredients over a window (from `sale` movements). */
export function getInventoryReport(restaurantId: string, from: Date, to: Date) {
  return tenantDb(restaurantId, (tx) =>
    tx.$queryRaw<{ name: string; used: number; cogs: number }[]>`
      select i.name as name,
             sum(-m."changeQty")::float8 as used,
             sum(-m."changeQty" * coalesce(m."unitCost", 0))::float8 as cogs
      from stock_movements m
      join inventory_items i on i.id = m."inventoryItemId"
      where m."restaurantId" = ${restaurantId}
        and m.reason = 'sale'
        and m."createdAt" between ${from} and ${to}
      group by i.name
      order by cogs desc`,
  );
}
