"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { setRestaurantStatus } from "@/server/agent-portal/events";

/** Super-admin override: restore access for a suspended restaurant. */
export async function unsuspendRestaurant(formData: FormData): Promise<void> {
  await requireOwnerAction();
  const restaurantId = String(formData.get("restaurantId"));
  await systemDb((tx) => setRestaurantStatus(tx, restaurantId, "active"));
  revalidatePath("/super-admin");
}
