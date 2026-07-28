import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { TIERS, TIER_INFO, type Tier } from "@/lib/billing/catalog";

export interface TierPricing {
  pricePesos: number;
  maxTables?: number;
  maxStaff?: number;
  smsIncluded?: number;
}

/**
 * Live pricing for the public catalog, read from the `plans` table (matched to
 * tiers by name) so whatever the super-admin edits shows up on the landing page
 * and the in-app billing comparison. Falls back to the static catalog defaults
 * for any tier that isn't in the DB.
 */
export async function getPublicPricing(): Promise<Record<Tier, TierPricing>> {
  const out = {} as Record<Tier, TierPricing>;
  for (const t of TIERS) out[t] = { pricePesos: TIER_INFO[t].pricePesos };

  try {
    const plans = await systemDb((tx) =>
      tx.plan.findMany({
        where: { isActive: true },
        select: { name: true, priceMonthly: true, limits: true },
      }),
    );
    for (const p of plans) {
      if (!(TIERS as readonly string[]).includes(p.name)) continue;
      const t = p.name as Tier;
      const lim = (p.limits as { maxTables?: number; maxStaff?: number; smsIncluded?: number } | null) ?? {};
      out[t] = {
        pricePesos: Math.round(p.priceMonthly / 100),
        // Tables / QR codes are unlimited on every plan now — never surface a cap.
        maxTables: undefined,
        maxStaff: lim.maxStaff,
        smsIncluded: lim.smsIncluded,
      };
    }
  } catch {
    /* DB unavailable — fall back to catalog defaults */
  }
  return out;
}
