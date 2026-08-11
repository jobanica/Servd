import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";
import type { Feature } from "@/lib/billing/features";

/**
 * Features sold as their OWN monthly subscription rather than with the plan or
 * as a one-time unlock. These are deliberately excluded from plan grants AND
 * from the trial's blanket unlock — the first month must be paid before the
 * feature opens, and access lapses when the paid period ends.
 */
export const MONTHLY_FEATURES: Record<string, { label: string; priceMonthly: number }> = {
  contentScheduler: { label: "Content scheduler", priceMonthly: 49_900 }, // ₱499/mo
};

export function isMonthlyFeature(feature: string): boolean {
  return feature in MONTHLY_FEATURES;
}

export interface FeatureSubStatus {
  active: boolean;
  status: string; // pending | active | past_due | cancelled | none
  currentPeriodEnd: Date | null;
  priceMonthly: number;
  /** A checkout was started but hasn't been paid yet. */
  pending: boolean;
}

/** Where this restaurant stands on a monthly feature. */
export async function getFeatureSubscription(
  restaurantId: string,
  feature: string,
): Promise<FeatureSubStatus> {
  const price = MONTHLY_FEATURES[feature]?.priceMonthly ?? 0;
  const none: FeatureSubStatus = {
    active: false,
    status: "none",
    currentPeriodEnd: null,
    priceMonthly: price,
    pending: false,
  };
  try {
    const row = await systemDb((tx) =>
      tx.featureSubscription.findFirst({ where: { restaurantId, feature } }),
    );
    if (!row) return none;
    const live =
      row.status === "active" && !!row.currentPeriodEnd && row.currentPeriodEnd.getTime() > Date.now();
    return {
      active: live,
      status: row.status,
      currentPeriodEnd: row.currentPeriodEnd,
      priceMonthly: row.priceMonthly || price,
      pending: row.status === "pending",
    };
  } catch {
    return none; // table not migrated yet → locked, nothing breaks
  }
}

/** Every monthly feature this restaurant currently has paid, live access to. */
export async function listActiveMonthlyFeatures(restaurantId: string): Promise<Set<Feature>> {
  try {
    const rows = await systemDb((tx) =>
      tx.featureSubscription.findMany({
        where: { restaurantId, status: "active", currentPeriodEnd: { gt: new Date() } },
        select: { feature: true },
      }),
    );
    return new Set(rows.map((r) => r.feature as Feature));
  } catch {
    return new Set<Feature>();
  }
}

/**
 * Settle a monthly-feature payment from a gateway webhook: activate it and push
 * the period out a month. Returns false when the ref isn't one of these, so the
 * caller can fall through to add-ons / plan subscriptions. Idempotent.
 */
export async function activateFeatureSubByProviderRef(providerRef: string): Promise<boolean> {
  if (!providerRef) return false;
  try {
    return await systemDb(async (tx) => {
      const row = await tx.featureSubscription.findFirst({ where: { providerRef } });
      if (!row) return false;
      const now = new Date();
      // Extend from the existing period if it's still running, else from now.
      const base =
        row.currentPeriodEnd && row.currentPeriodEnd > now ? row.currentPeriodEnd : now;
      await tx.featureSubscription.update({
        where: { id: row.id },
        data: { status: "active", currentPeriodEnd: addMonths(base, 1) },
      });
      return true;
    });
  } catch {
    return false;
  }
}
