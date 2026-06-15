import { tenantDb } from "@/server/tenancy/scoped-db";

/** All staff logins for the restaurant. */
export function listStaff(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.staffUser.findMany({ orderBy: [{ role: "asc" }, { email: "asc" }] }),
  );
}
