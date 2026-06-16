import { tenantDb } from "@/server/tenancy/scoped-db";
import type { PlanModuleType } from "@prisma/client";

export interface PlanLimits {
  maxTables?: number;
  maxStaff?: number;
  smsIncluded?: number;
}

/** Every add-on module — unlocked for all during the free trial. */
const ALL_MODULES: PlanModuleType[] = ["hris", "inventory", "custom_domain"];

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

    // Free trial = full access: all modules, no limits, for 30 days.
    let onTrial = false;
    try {
      const sub = await tx.subscription.findFirst({
        orderBy: { createdAt: "desc" },
        select: { status: true, trialEndsAt: true },
      });
      onTrial =
        sub?.status === "trialing" &&
        sub.trialEndsAt != null &&
        sub.trialEndsAt.getTime() > Date.now();
    } catch {
      /* no subscription row — fall through to plan entitlements */
    }
    if (onTrial) {
      return {
        planName: restaurant.plan?.name ?? "Free trial",
        limits: {}, // unlimited during the trial
        modules: new Set(ALL_MODULES),
        status: restaurant.status,
      };
    }

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
