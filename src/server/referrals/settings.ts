import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import type { BonusTierDef } from "@/lib/referrals/rules";

export interface ProgramSettings {
  track1CreditMonths: number;
  /** FINAL Track-2 terms: flat year-1 % then ongoing % for life. */
  commissionPctYear1: number;
  commissionPctOngoing: number;
  /** Year-1 boundary in months (reuses track2DurationMonths). */
  year1Months: number;
  /** Milestone bonuses (centavos), stacked as active referrals cross each tier. */
  bonusTiers: BonusTierDef[];
  bountyAmount: number;
  payoutModel: "recurring" | "bounty";
  cookieDays: number;
  clawbackDays: number;
  minPayout: number;
  /** Configurable withholding % for payout statements (PH reporting). */
  withholdingPct: number;
}

/** Canonical milestone bonuses (centavos) — fallback if not set in the DB. */
export const DEFAULT_BONUS_TIERS: BonusTierDef[] = [
  { activeReferrals: 10, amount: 200_000 },
  { activeReferrals: 25, amount: 500_000 },
  { activeReferrals: 50, amount: 1_500_000 },
  { activeReferrals: 100, amount: 4_000_000 },
  { activeReferrals: 250, amount: 10_000_000 },
];

export const DEFAULT_PROGRAM_SETTINGS: ProgramSettings = {
  track1CreditMonths: 1,
  commissionPctYear1: 30,
  commissionPctOngoing: 10,
  year1Months: 12,
  bonusTiers: DEFAULT_BONUS_TIERS,
  bountyAmount: 0,
  payoutModel: "recurring",
  cookieDays: 30,
  clawbackDays: 60,
  minPayout: 50000,
  withholdingPct: 0,
};

/** Parse + sanitize the stored bonus tiers JSON; fall back to the defaults. */
export function parseBonusTiers(raw: unknown): BonusTierDef[] {
  if (!Array.isArray(raw)) return DEFAULT_BONUS_TIERS;
  const tiers = raw
    .map((t) => {
      const o = t as { activeReferrals?: unknown; amount?: unknown };
      return { activeReferrals: Number(o?.activeReferrals), amount: Number(o?.amount) };
    })
    .filter((t) => Number.isFinite(t.activeReferrals) && t.activeReferrals > 0 && Number.isFinite(t.amount) && t.amount >= 0)
    .sort((a, b) => a.activeReferrals - b.activeReferrals);
  return tiers.length ? tiers : DEFAULT_BONUS_TIERS;
}

/** Read program settings (singleton). Falls back to defaults if not migrated. */
export async function getProgramSettings(): Promise<ProgramSettings> {
  try {
    const row = await systemDb((tx) =>
      tx.programSetting.findUnique({ where: { id: "program" } }),
    );
    if (!row) return DEFAULT_PROGRAM_SETTINGS;
    return {
      track1CreditMonths: row.track1CreditMonths,
      commissionPctYear1: row.commissionPctYear1 ?? DEFAULT_PROGRAM_SETTINGS.commissionPctYear1,
      commissionPctOngoing: row.commissionPctOngoing ?? DEFAULT_PROGRAM_SETTINGS.commissionPctOngoing,
      year1Months: row.track2DurationMonths,
      bonusTiers: parseBonusTiers(row.bonusTiersJson),
      bountyAmount: row.bountyAmount,
      payoutModel: (row.payoutModel as ProgramSettings["payoutModel"]) ?? "recurring",
      cookieDays: row.cookieDays,
      clawbackDays: row.clawbackDays,
      minPayout: row.minPayout,
      withholdingPct: row.withholdingPct ?? 0,
    };
  } catch {
    return DEFAULT_PROGRAM_SETTINGS;
  }
}
