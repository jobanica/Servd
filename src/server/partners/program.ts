import "server-only";

import { PARTNER_PROGRAM, type PartnerProgram } from "@/lib/partners/program";
import { getProgramSettings } from "@/server/referrals/settings";

/**
 * The effective partner program for the public landing page. The payout engine
 * and this page now read the SAME program_settings, so they can't drift: rates,
 * the year-1 boundary, and the bonus tiers all come from the DB (with
 * PARTNER_PROGRAM as the fallback default). Bonus amounts are stored in centavos
 * in settings and shown in pesos here.
 */
export async function getPartnerProgram(): Promise<PartnerProgram> {
  try {
    const s = await getProgramSettings();
    return {
      ...PARTNER_PROGRAM,
      firstYearPct: s.commissionPctYear1,
      lifetimePct: s.commissionPctOngoing,
      firstYearMonths: s.year1Months,
      bonusTiers: s.bonusTiers.map((t) => ({
        activeReferrals: t.activeReferrals,
        bonusPesos: Math.round(t.amount / 100),
      })),
    };
  } catch {
    return PARTNER_PROGRAM;
  }
}
