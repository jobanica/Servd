import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

export interface ProgramSettings {
  track1CreditMonths: number;
  track2CommissionPct: number;
  track2ResellerPct: number;
  track2DurationMonths: number;
  bountyAmount: number;
  payoutModel: "recurring" | "bounty";
  cookieDays: number;
  clawbackDays: number;
  minPayout: number;
}

export const DEFAULT_PROGRAM_SETTINGS: ProgramSettings = {
  track1CreditMonths: 1,
  track2CommissionPct: 25,
  track2ResellerPct: 35,
  track2DurationMonths: 12,
  bountyAmount: 0,
  payoutModel: "recurring",
  cookieDays: 30,
  clawbackDays: 60,
  minPayout: 50000,
};

/** Read program settings (singleton). Falls back to defaults if not migrated. */
export async function getProgramSettings(): Promise<ProgramSettings> {
  try {
    const row = await systemDb((tx) =>
      tx.programSetting.findUnique({ where: { id: "program" } }),
    );
    if (!row) return DEFAULT_PROGRAM_SETTINGS;
    return {
      track1CreditMonths: row.track1CreditMonths,
      track2CommissionPct: row.track2CommissionPct,
      track2ResellerPct: row.track2ResellerPct,
      track2DurationMonths: row.track2DurationMonths,
      bountyAmount: row.bountyAmount,
      payoutModel: (row.payoutModel as ProgramSettings["payoutModel"]) ?? "recurring",
      cookieDays: row.cookieDays,
      clawbackDays: row.clawbackDays,
      minPayout: row.minPayout,
    };
  } catch {
    return DEFAULT_PROGRAM_SETTINGS;
  }
}
