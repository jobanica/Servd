import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The items marked "Available soon" — on the menu for diners to see, not
 * orderable yet.
 *
 * Read as its own best-effort query, the same way posOnly and noPackaging are:
 * the column arrives in a hand-run migration, and touching it in the main menu
 * load would take the whole storefront down on a database without it. An empty
 * set means "nothing is coming soon" — every menu exactly as it was before.
 */
export async function getComingSoonItemIds(restaurantId: string): Promise<Set<string>> {
  try {
    const rows = await systemDb((tx) =>
      tx.menuItem.findMany({
        where: { restaurantId, comingSoon: true },
        select: { id: true },
      }),
    );
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}
