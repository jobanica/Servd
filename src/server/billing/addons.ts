import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getPlanAccess } from "@/server/billing/feature-gate";

/** One-time price to unlock a custom domain on Free / during a trial (centavos). */
export const CUSTOM_DOMAIN_PRICE = 50_000; // ₱500.00

export const CUSTOM_DOMAIN_ADDON = "custom_domain";

export interface CustomDomainAccess {
  allowed: boolean;
  /** Included in the paid plan (Growth/Business, off-trial) — nothing to buy. */
  viaPlan: boolean;
  /** Bought as the one-time ₱500 unlock. */
  viaPurchase: boolean;
  /** A checkout was started but hasn't been paid yet. */
  pending: boolean;
}

/** True once this restaurant has a settled purchase for the add-on. */
async function hasPaidAddon(restaurantId: string, addon: string): Promise<boolean> {
  try {
    const row = await systemDb((tx) =>
      tx.addonPurchase.findFirst({ where: { restaurantId, addon, status: "paid" }, select: { id: true } }),
    );
    return !!row;
  } catch {
    return false; // table not migrated yet → treat as not purchased
  }
}

async function hasPendingAddon(restaurantId: string, addon: string): Promise<boolean> {
  try {
    const row = await systemDb((tx) =>
      tx.addonPurchase.findFirst({ where: { restaurantId, addon, status: "pending" }, select: { id: true } }),
    );
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Who may use a custom domain.
 *
 * A PAID Growth/Business subscription includes it. Free accounts — and accounts
 * still on a trial, since a trial otherwise unlocks every feature — must buy
 * the one-time ₱500 unlock. Once bought it's theirs for good, whatever plan
 * they're on later.
 */
export async function getCustomDomainAccess(restaurantId: string): Promise<CustomDomainAccess> {
  const access = await getPlanAccess(restaurantId);
  // Deliberately ignores the trial's blanket feature unlock — the domain stays
  // locked until they either pay for a plan or buy the add-on.
  const viaPlan = !access.onTrial && access.features.has("customDomain");
  if (viaPlan) return { allowed: true, viaPlan: true, viaPurchase: false, pending: false };

  const viaPurchase = await hasPaidAddon(restaurantId, CUSTOM_DOMAIN_ADDON);
  const pending = viaPurchase ? false : await hasPendingAddon(restaurantId, CUSTOM_DOMAIN_ADDON);
  return { allowed: viaPurchase, viaPlan: false, viaPurchase, pending };
}

/**
 * Settle an add-on purchase from a gateway webhook. Returns false when the ref
 * isn't an add-on (so the caller can fall through to subscription activation).
 * Idempotent — a replayed webhook is a no-op.
 */
export async function markAddonPaidByProviderRef(providerRef: string): Promise<boolean> {
  if (!providerRef) return false;
  try {
    return await systemDb(async (tx) => {
      const row = await tx.addonPurchase.findFirst({ where: { providerRef } });
      if (!row) return false;
      if (row.status !== "paid") {
        await tx.addonPurchase.update({
          where: { id: row.id },
          data: { status: "paid", paidAt: new Date() },
        });
      }
      return true;
    });
  } catch {
    return false;
  }
}
