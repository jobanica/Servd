import "server-only";

import { redirect } from "next/navigation";
import { systemDb } from "@/server/tenancy/scoped-db";
import type { Tier } from "@/lib/billing/catalog";
import {
  ALL_FEATURES,
  asTier,
  defaultFeaturesForTier,
  sanitizeFeatures,
  type Feature,
} from "@/lib/billing/features";

/**
 * Plan-based feature gating. Entitlements are resolved LIVE from the features
 * the super-admin has enabled on the restaurant's plan, so adding/removing a
 * feature on a plan instantly applies to every subscription on it. A paid-plan
 * free trial unlocks everything for its duration.
 *
 * If a plan has no features configured yet (e.g. before the migration runs), we
 * fall back to the default feature→tier mapping by plan name.
 */

export type { Feature };

export interface PlanAccess {
  tier: Tier | null;
  onTrial: boolean;
  /** The features this restaurant's plan currently grants. */
  features: Set<Feature>;
}

/** The restaurant's effective tier, trial state, and the plan's enabled features. */
export async function getPlanAccess(restaurantId: string): Promise<PlanAccess> {
  try {
    // systemDb so this also works from public routes (no tenant context).
    return await systemDb(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { status: true, trialEndsAt: true, plan: { select: { name: true, features: true } } },
      });
      const onTrial =
        sub?.status === "trialing" && sub.trialEndsAt != null && sub.trialEndsAt.getTime() > Date.now();
      const tier = asTier(sub?.plan?.name);
      // Stored features are authoritative once configured; otherwise fall back
      // to the tier defaults (an unknown plan name fails open to everything).
      const stored = sanitizeFeatures(sub?.plan?.features ?? []);
      const features = new Set<Feature>(
        stored.length ? stored : tier ? defaultFeaturesForTier(tier) : ALL_FEATURES,
      );
      return { tier, onTrial, features };
    });
  } catch {
    // `plan.features` column not migrated yet → resolve from tier defaults.
    return getPlanAccessByTier(restaurantId);
  }
}

/** Legacy/pre-migration path: resolve entitlements from the plan name's tier. */
async function getPlanAccessByTier(restaurantId: string): Promise<PlanAccess> {
  try {
    return await systemDb(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { status: true, trialEndsAt: true, plan: { select: { name: true } } },
      });
      const onTrial =
        sub?.status === "trialing" && sub.trialEndsAt != null && sub.trialEndsAt.getTime() > Date.now();
      const tier = asTier(sub?.plan?.name);
      const features = new Set<Feature>(tier ? defaultFeaturesForTier(tier) : ALL_FEATURES);
      return { tier, onTrial, features };
    });
  } catch {
    return { tier: null, onTrial: false, features: new Set(ALL_FEATURES) };
  }
}

/** Whether the restaurant's plan includes a feature (trial = everything). */
export async function hasFeature(restaurantId: string, feature: Feature): Promise<boolean> {
  const { onTrial, features } = await getPlanAccess(restaurantId);
  if (onTrial) return true; // free trial unlocks all features
  return features.has(feature);
}

/** The full set of features the restaurant currently has access to. */
export async function getEntitledFeatures(restaurantId: string): Promise<Set<Feature>> {
  const { onTrial, features } = await getPlanAccess(restaurantId);
  return onTrial ? new Set(ALL_FEATURES) : features;
}

/** Page guard: redirect to the billing page (to upgrade) if the plan lacks it. */
export async function requireFeaturePage(restaurantId: string, feature: Feature): Promise<void> {
  if (!(await hasFeature(restaurantId, feature))) {
    redirect(`/admin/billing?upgrade=${feature}`);
  }
}
