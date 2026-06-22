import "server-only";

import { redirect } from "next/navigation";
import { systemDb } from "@/server/tenancy/scoped-db";
import { TIERS, type Tier } from "@/lib/billing/catalog";

/**
 * Plan-based feature gating. The free trial unlocks everything; once a paid
 * plan is active, features are limited by tier. Reads the current subscription
 * to resolve the tier (by plan name).
 */

export type Feature =
  | "onlineOrdering"
  | "onlinePayments"
  | "loyalty"
  | "promotions"
  | "customers"
  | "sms"
  | "aiMenuImport"
  | "floorPlan"
  | "giftCards"
  | "accounting"
  | "inventory"
  | "hr"
  | "customDomain";

/** Which tiers include each feature (must match src/lib/billing/catalog.ts). */
const FEATURE_TIERS: Record<Feature, Tier[]> = {
  onlineOrdering: ["Growth", "Business"],
  onlinePayments: ["Growth", "Business"],
  loyalty: ["Growth", "Business"],
  promotions: ["Growth", "Business"],
  customers: ["Growth", "Business"],
  sms: ["Growth", "Business"],
  aiMenuImport: ["Growth", "Business"],
  floorPlan: ["Growth", "Business"],
  giftCards: ["Growth", "Business"],
  customDomain: ["Growth", "Business"],
  accounting: ["Business"],
  inventory: ["Business"],
  hr: ["Business"],
};

export interface PlanAccess {
  tier: Tier | null;
  onTrial: boolean;
}

/** The restaurant's effective tier + whether it's still in the free trial. */
export async function getPlanAccess(restaurantId: string): Promise<PlanAccess> {
  try {
    // systemDb so this also works from public routes (no tenant context).
    return await systemDb(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { status: true, trialEndsAt: true, plan: { select: { name: true } } },
      });
      const onTrial =
        sub?.status === "trialing" && sub.trialEndsAt != null && sub.trialEndsAt.getTime() > Date.now();
      const name = sub?.plan?.name ?? null;
      const tier = name && (TIERS as readonly string[]).includes(name) ? (name as Tier) : null;
      return { tier, onTrial };
    });
  } catch {
    return { tier: null, onTrial: false };
  }
}

/** Whether the restaurant's plan includes a feature (trial = everything). */
export async function hasFeature(restaurantId: string, feature: Feature): Promise<boolean> {
  const { tier, onTrial } = await getPlanAccess(restaurantId);
  if (onTrial) return true; // free trial unlocks all features
  if (!tier) return true; // unknown plan → don't block (fail open)
  return FEATURE_TIERS[feature].includes(tier);
}

/** The full set of features the restaurant currently has access to. */
export async function getEntitledFeatures(restaurantId: string): Promise<Set<Feature>> {
  const { tier, onTrial } = await getPlanAccess(restaurantId);
  const all = Object.keys(FEATURE_TIERS) as Feature[];
  if (onTrial || !tier) return new Set(all);
  return new Set(all.filter((f) => FEATURE_TIERS[f].includes(tier)));
}

/** Page guard: redirect to the billing page (to upgrade) if the plan lacks it. */
export async function requireFeaturePage(restaurantId: string, feature: Feature): Promise<void> {
  if (!(await hasFeature(restaurantId, feature))) {
    redirect(`/admin/billing?upgrade=${feature}`);
  }
}
