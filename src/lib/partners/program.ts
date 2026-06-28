/**
 * Partner program — single source of truth for the public landing page AND the
 * commission/payout engine. Pure + client-safe so the calculator and the
 * backend never disagree. These are the FINAL terms (they supersede the earlier
 * placeholder rates in the affiliate backend); align program_settings to match.
 */

export interface BonusTier {
  /** Active paying referrals needed to unlock this one-time bonus. */
  activeReferrals: number;
  /** Bonus amount in PESOS (marketing/display + payout). */
  bonusPesos: number;
}

export interface PartnerProgram {
  firstYearPct: number; // commission for the first year
  lifetimePct: number; // commission every month after, for life
  firstYearMonths: number; // length of the first-year window
  bonusTiers: BonusTier[]; // stack as each milestone is reached
  defaultPlanPricePesos: number; // calculator default
  maxReferralsSlider: number; // calculator upper bound
  freeToJoin: boolean;
  payoutMethods: string[];
}

export const PARTNER_PROGRAM: PartnerProgram = {
  firstYearPct: 30,
  lifetimePct: 10,
  firstYearMonths: 12,
  bonusTiers: [
    { activeReferrals: 10, bonusPesos: 2_000 },
    { activeReferrals: 25, bonusPesos: 5_000 },
    { activeReferrals: 50, bonusPesos: 15_000 },
    { activeReferrals: 100, bonusPesos: 40_000 },
    { activeReferrals: 250, bonusPesos: 100_000 },
  ],
  defaultPlanPricePesos: 1_500,
  maxReferralsSlider: 250,
  freeToJoin: true,
  payoutMethods: ["GCash", "bank transfer"],
};

/** One-time bonuses unlocked at a given number of active referrals (stacked). */
export function bonusesFor(
  activeReferrals: number,
  tiers: BonusTier[] = PARTNER_PROGRAM.bonusTiers,
): { total: number; reached: BonusTier[] } {
  const reached = tiers.filter((t) => activeReferrals >= t.activeReferrals);
  const total = reached.reduce((sum, t) => sum + t.bonusPesos, 0);
  return { total, reached };
}

export interface EarningsInput {
  restaurants: number;
  monthlyPricePesos: number;
}

export interface Earnings {
  yearOneCommission: number;
  bonusesUnlocked: number;
  bonusTiersReached: BonusTier[];
  firstYearTotal: number;
  ongoingPerYear: number;
}

/** Live earnings math for the calculator (all values in pesos). */
export function computeEarnings(
  input: EarningsInput,
  program: PartnerProgram = PARTNER_PROGRAM,
): Earnings {
  const restaurants = Math.max(0, Math.floor(input.restaurants || 0));
  const price = Math.max(0, input.monthlyPricePesos || 0);

  const yearOneCommission =
    restaurants * price * program.firstYearMonths * (program.firstYearPct / 100);
  const { total: bonusesUnlocked, reached } = bonusesFor(restaurants, program.bonusTiers);
  const ongoingPerYear = restaurants * price * 12 * (program.lifetimePct / 100);

  return {
    yearOneCommission,
    bonusesUnlocked,
    bonusTiersReached: reached,
    firstYearTotal: yearOneCommission + bonusesUnlocked,
    ongoingPerYear,
  };
}

/** Format a peso amount with thousands separators, e.g. 1234567 -> "₱1,234,567". */
export function formatPHP(pesos: number): string {
  return `₱${Math.round(pesos).toLocaleString("en-US")}`;
}
