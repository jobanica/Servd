import { tenantDb } from "@/server/tenancy/scoped-db";

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
