import "server-only";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Deducts recipe ingredients for a completed order. Idempotent via
 * order.inventoryDeductedAt — safe to call more than once. Records a `sale`
 * stock movement per ingredient (with the cost at the time, for COGS), and if
 * autoOutOfStock is on, flips menu items whose ingredients hit ≤ 0 to
 * unavailable. Best-effort: never throws into the order flow.
 */
export async function deductForOrder(restaurantId: string, orderId: string): Promise<void> {
  try {
    await tenantDb(restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId },
        select: { inventoryDeductedAt: true, items: { select: { menuItemId: true, quantity: true } } },
      });
      if (!order || order.inventoryDeductedAt) return;

      const restaurant = await tx.restaurant.findFirstOrThrow({
        select: { autoOutOfStock: true },
      });

      const menuItemIds = [...new Set(order.items.map((i) => i.menuItemId))];
      const recipes = await tx.recipeComponent.findMany({
        where: { menuItemId: { in: menuItemIds } },
      });

      // Total quantity to deduct per ingredient across the whole order.
      const deductions = new Map<string, number>();
      for (const line of order.items) {
        for (const rc of recipes.filter((r) => r.menuItemId === line.menuItemId)) {
          deductions.set(
            rc.inventoryItemId,
            (deductions.get(rc.inventoryItemId) ?? 0) + rc.quantity * line.quantity,
          );
        }
      }

      const depleted: string[] = [];
      for (const [invId, qty] of deductions) {
        const inv = await tx.inventoryItem.findUnique({ where: { id: invId } });
        if (!inv) continue;
        const newStock = inv.stockQty - qty;
        await tx.inventoryItem.update({ where: { id: invId }, data: { stockQty: newStock } });
        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: invId,
            changeQty: -qty,
            reason: "sale",
            unitCost: inv.costPerUnit,
            refId: orderId,
          },
        });
        if (newStock <= 0) depleted.push(invId);
      }

      // Auto out-of-stock: any menu item using a depleted ingredient.
      if (restaurant.autoOutOfStock && depleted.length > 0) {
        const affected = await tx.recipeComponent.findMany({
          where: { inventoryItemId: { in: depleted } },
          select: { menuItemId: true },
        });
        const ids = [...new Set(affected.map((a) => a.menuItemId))];
        if (ids.length > 0) {
          await tx.menuItem.updateMany({
            where: { id: { in: ids } },
            data: { isAvailable: false },
          });
        }
      }

      await tx.order.update({ where: { id: orderId }, data: { inventoryDeductedAt: new Date() } });
    });
  } catch {
    // Inventory must never block the kitchen flow.
  }
}
