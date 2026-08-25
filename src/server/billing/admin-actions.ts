"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireSuperAdmin } from "@/server/tenancy/current-user";

/** Super-admin override: restore access for a suspended restaurant. */
export async function unsuspendRestaurant(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  await systemDb((tx) =>
    tx.restaurant.update({ where: { id: restaurantId }, data: { status: "active" }, select: { id: true } }),
  );
  revalidatePath("/super-admin");
}
