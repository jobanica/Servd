import { tenantDb } from "@/server/tenancy/scoped-db";
import type { PlanModuleType } from "@prisma/client";
import { getPlanAccess } from "@/server/billing/feature-gate";
import type { Feature } from "@/lib/billing/features";

export interface PlanLimits {
  maxTables?: number;
  maxStaff?: number;
  smsIncluded?: number;
}

// The premium add-on modules map 1:1 to gateable features, so module access is
// resolved from the SAME plan feature set as everything else — a trial grants
// the trialed plan's modules (Growth trial → custom domain only, not HR/inventory).
const MODULE_FOR_FEATURE: Record<PlanModuleType, Feature> = {
  hris: "hr",
  inventory: "inventory",
  custom_domain: "customDomain",
};

export interface Entitlements {
  planName: string | null;
  limits: PlanLimits;
  modules: Set<PlanModuleType>;
  status: string; // restaurant status (active/suspended/...)
}

/**
 * Resolves what a restaurant is entitled to: its plan's add-on modules + limits.
 * Modules come from the plan's feature set (via getPlanAccess), so trials unlock
 * only the trialed plan's modules — never everything. Limits stay relaxed during
 * a trial so tiers can be tried without hitting caps.
 */
export async function getEntitlements(restaurantId: string): Promise<Entitlements> {
  const access = await getPlanAccess(restaurantId);

  const modules = new Set<PlanModuleType>();
  for (const [mod, feature] of Object.entries(MODULE_FOR_FEATURE) as [PlanModuleType, Feature][]) {
    if (access.features.has(feature)) modules.add(mod);
  }

  // Status + plan limits from the restaurant row (best-effort).
  let status = "active";
  let planName: string | null = access.tier;
  let planLimits: PlanLimits = {};
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: { status: true, plan: { select: { name: true, limits: true } } },
      }),
    );
    status = r.status;
    planName = r.plan?.name ?? planName;
    planLimits = (r.plan?.limits as PlanLimits | null) ?? {};
  } catch {
    /* no restaurant/plan row — fall back to feature-derived entitlements */
  }

  return {
    planName,
    limits: access.onTrial ? {} : planLimits, // trial: no caps; else the plan's limits
    modules,
    status,
  };
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
