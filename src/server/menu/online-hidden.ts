import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Categories the owner hid from the online ordering website. The table QR menu
 * and the cashier still show them.
 *
 * A separate best-effort query, like posOnly: on a database without the column
 * the answer is "nothing hidden", which is how every shop behaved before.
 */
export async function getOnlineHiddenCategoryIds(restaurantId: string): Promise<Set<string>> {
  try {
    const rows = await systemDb((tx) =>
      tx.category.findMany({ where: { restaurantId, hideOnline: true }, select: { id: true } }),
    );
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}
