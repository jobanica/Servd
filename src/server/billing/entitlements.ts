import { tenantDb } from "@/server/tenancy/scoped-db";
import type { PlanModuleType } from "@prisma/client";

export interface PlanLimits {
  maxTables?: number;
  maxStaff?: number;
  smsIncluded?: number;
}

export interface Entitlements {
  planName: string | null;
  limits: PlanLimits;
  modules: Set<PlanModuleType>;
  status: string; // restaurant status (active/suspended/...)
}

/**
 * Resolves what a restaurant is entitled to: its plan limits + enabled add-on
 * modules. Plans/plan_modules are readable in any RLS context (policy = true);
 * the restaurant row is tenant-scoped.
 */
export async function getEntitlements(restaurantId: string): Promise<Entitlements> {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: {
        status: true,
        plan: {
          select: {
            name: true,
            limits: true,
            modules: { where: { enabled: true }, select: { module: true } },
          },
        },
      },
    });
    const limits = (restaurant.plan?.limits as PlanLimits | null) ?? {};
    return {
      planName: restaurant.plan?.name ?? null,
      limits,
      modules: new Set((restaurant.plan?.modules ?? []).map((m) => m.module)),
      status: restaurant.status,
    };
  });
}

/** True if the restaurant's plan unlocks a module (used by F/G/H gating). */
export async function hasModule(
  restaurantId: string,
  module: PlanModuleType,
): Promise<boolean> {
  const ent = await getEntitlements(restaurantId);
  return ent.modules.has(module);
}

/**
 * Throws PLAN_LIMIT if adding one more of `key` would exceed the plan. A missing
 * limit means unlimited. `currentCount` is the existing count of that resource.
 */
export async function assertWithinLimit(
  restaurantId: string,
  key: keyof PlanLimits,
  currentCount: number,
): Promise<void> {
  const ent = await getEntitlements(restaurantId);
  const max = ent.limits[key];
  if (typeof max === "number" && currentCount >= max) {
    throw new Error("PLAN_LIMIT");
  }
}
