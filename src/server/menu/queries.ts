import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Read helpers for the admin menu screens. All are tenant-scoped: they run
 * inside tenantDb(restaurantId), so RLS guarantees only this restaurant's rows
 * come back even though the queries themselves don't repeat the filter.
 */

/** Categories (sorted) each with their items (sorted). */
export function getMenu(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        menuItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
  );
}

/** Flat list of categories, for select inputs. */
export function getCategories(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.category.findMany({ orderBy: { sortOrder: "asc" } }),
  );
}

/** A single item with the modifier groups attached to it. */
export function getItem(restaurantId: string, itemId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.menuItem.findFirst({
      where: { id: itemId },
      include: {
        modifierGroups: { include: { group: true } },
      },
    }),
  );
}

/** All modifier groups for the restaurant, with their options. */
export function getModifierGroups(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.modifierGroup.findMany({
      orderBy: { createdAt: "asc" },
      include: { modifiers: { orderBy: { sortOrder: "asc" } } },
    }),
  );
}
