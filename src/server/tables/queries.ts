import { tenantDb } from "@/server/tenancy/scoped-db";

/** Tables for the restaurant, ordered for display. Tenant-scoped via RLS. */
export function getTables(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.table.findMany({ orderBy: { createdAt: "asc" } }),
  );
}

/** The restaurant's slug + name — needed to build QR URLs and label the sheet. */
export function getRestaurantBrief(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { name: true, displayName: true, slug: true },
    }),
  );
}
