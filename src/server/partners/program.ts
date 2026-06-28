import "server-only";

import { PARTNER_PROGRAM, type PartnerProgram } from "@/lib/partners/program";
import { getProgramSettings } from "@/server/referrals/settings";

/**
 * The effective partner program for display + payout. The canonical terms live
 * in PARTNER_PROGRAM (shared with the commission engine); here we overlay any
 * value the affiliate backend genuinely exposes so the page can't drift from
 * the engine. Today only the first-year window maps cleanly
 * (program_settings.track2DurationMonths); the rates + bonus tiers are canonical
 * until the backend adds matching fields.
 */
export async function getPartnerProgram(): Promise<PartnerProgram> {
  try {
    const s = await getProgramSettings();
    return {
      ...PARTNER_PROGRAM,
      firstYearMonths: s.track2DurationMonths || PARTNER_PROGRAM.firstYearMonths,
    };
  } catch {
    return PARTNER_PROGRAM;
  }
}
