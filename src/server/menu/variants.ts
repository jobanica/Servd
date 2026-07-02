import "server-only";

import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Per-item sizes/variants. Loaded via a SEPARATE best-effort query (not a Prisma
 * include on the menu queries) so existing menu/order reads never break if the
 * menu_item_variants table isn't migrated yet.
 */

export interface Variant {
  id: string;
  name: string;
  price: number; // absolute, centavos
}

/** Variants per item id (system context — used by the public menu + order build). */
export async function getVariantsMap(itemIds: string[]): Promise<Map<string, Variant[]>> {
  const map = new Map<string, Variant[]>();
  if (itemIds.length === 0) return map;
  try {
    const rows = await systemDb((tx) =>
      tx.menuItemVariant.findMany({
        where: { menuItemId: { in: itemIds } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, menuItemId: true, name: true, price: true },
      }),
    );
    for (const r of rows) {
      const list = map.get(r.menuItemId) ?? [];
      list.push({ id: r.id, name: r.name, price: r.price });
      map.set(r.menuItemId, list);
    }
  } catch {
    /* menu_item_variants not migrated yet → no variants */
  }
  return map;
}

/** A single item's variants, tenant-scoped (for the admin edit page). Best-effort. */
export async function getItemVariants(restaurantId: string, menuItemId: string): Promise<Variant[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.menuItemVariant.findMany({
        where: { menuItemId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, price: true },
      }),
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Replace an item's full variant list (delete + recreate) in one tenant tx.
 * Best-effort: silently no-ops if the table isn't migrated. `list` items with a
 * blank name are dropped; an empty list clears all variants for the item.
 */
export async function setItemVariants(
  restaurantId: string,
  menuItemId: string,
  list: { name: string; price: number }[],
): Promise<void> {
  const clean = list
    .map((v) => ({ name: v.name.trim(), price: Math.max(0, Math.round(v.price)) }))
    .filter((v) => v.name.length > 0)
    .slice(0, 20);
  try {
    await tenantDb(restaurantId, async (tx) => {
      // Confirm the item belongs to this tenant (RLS also enforces it).
      const item = await tx.menuItem.findFirst({ where: { id: menuItemId }, select: { id: true } });
      if (!item) return;
      await tx.menuItemVariant.deleteMany({ where: { menuItemId } });
      if (clean.length > 0) {
        await tx.menuItemVariant.createMany({
          data: clean.map((v, i) => ({ restaurantId, menuItemId, name: v.name, price: v.price, sortOrder: i })),
        });
      }
    });
  } catch {
    /* not migrated yet — ignore */
  }
}
