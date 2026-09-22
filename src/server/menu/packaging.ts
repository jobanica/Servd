import "server-only";

import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";

/**
 * The menu items that carry no packaging fee.
 *
 * Read as its own best-effort query rather than as a column on the menu load,
 * for the same reason `posOnly` is: `noPackaging` ships as a hand-run
 * migration, and touching a column the database doesn't have yet would take
 * down the whole storefront instead of one checkbox. An empty set means
 * "everything is packed", which is how every restaurant behaved before this
 * existed — so a lagging database keeps charging what it charged yesterday.
 */
export async function getNoPackagingItemIds(restaurantId: string): Promise<Set<string>> {
  try {
    const rows = await systemDb((tx) =>
      tx.menuItem.findMany({
        where: { restaurantId, noPackaging: true },
        select: { id: true },
      }),
    );
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

/**
 * Mark exactly these items as needing no packaging, and every other item on
 * the menu as needing it.
 *
 * Both halves matter: the owner unticking "Softdrinks" has to put the fee
 * back. Best-effort — on a database without the column the boxes simply don't
 * stick, which costs a setting rather than the storefront save it rides along
 * with.
 */
export async function setNoPackagingItemIds(
  restaurantId: string,
  exemptIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(exemptIds.filter((id) => typeof id === "string" && id.length > 0))];
  try {
    await tenantDb(restaurantId, async (tx) => {
      // Scoped to the restaurant on both writes — an id from another tenant's
      // menu posted into the form must not flip that tenant's item. Both
      // statements share one transaction, so the menu is never briefly in the
      // state where nothing is exempt.
      await tx.menuItem.updateMany({
        where: { restaurantId, id: { notIn: ids } },
        data: { noPackaging: false },
      });
      if (ids.length > 0) {
        await tx.menuItem.updateMany({
          where: { restaurantId, id: { in: ids } },
          data: { noPackaging: true },
        });
      }
    });
  } catch {
    /* noPackaging column not migrated yet */
  }
}
