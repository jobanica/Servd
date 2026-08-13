import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { stockStates, type StockState } from "@/lib/inventory/availability";

/**
 * Sellable stock per product, for the order validator.
 *
 * Deliberately best-effort and empty-on-failure: an inventory problem must
 * never stop a shop taking orders. An empty map means "no product is stock
 * limited", which is exactly the behaviour every restaurant had before product
 * stock existed.
 */
export async function getProductStockStates(
  restaurantId: string,
  menuItemIds: string[],
): Promise<Map<string, StockState>> {
  if (menuItemIds.length === 0) return new Map();
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const stock = await tx.inventoryItem.findMany({
        where: { menuItemId: { in: menuItemIds } },
        select: { menuItemId: true, stockQty: true },
      });
      if (stock.length === 0) return new Map<string, StockState>();

      // Units already promised: on an order that's been taken but whose stock
      // hasn't been deducted yet. Cancelled orders promise nothing.
      const tracked = stock.map((s) => s.menuItemId).filter((id): id is string => id != null);
      const open = await tx.orderItem.findMany({
        where: {
          menuItemId: { in: tracked },
          order: { inventoryDeductedAt: null, status: { notIn: ["cancelled"] } },
        },
        select: { menuItemId: true, quantity: true },
      });

      return stockStates(stock, open);
    });
  } catch {
    return new Map();
  }
}
