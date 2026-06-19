"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";

export type SettingsState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  track1CreditMonths: z.coerce.number().int().min(0).max(12),
  cookieDays: z.coerce.number().int().min(1).max(180),
  clawbackDays: z.coerce.number().int().min(0).max(365),
  track2CommissionPct: z.coerce.number().int().min(0).max(100),
  track2ResellerPct: z.coerce.number().int().min(0).max(100),
  track2DurationMonths: z.coerce.number().int().min(0).max(60),
  payoutModel: z.enum(["recurring", "bounty"]),
  bountyAmount: z.coerce.number().int().min(0), // centavos
  minPayout: z.coerce.number().int().min(0), // centavos
});

/** Super-admin: update Track-1 program settings (singleton). */
export async function updateProgramSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireSuperAdmin();
  const parsed = schema.safeParse({
    track1CreditMonths: formData.get("track1CreditMonths"),
    cookieDays: formData.get("cookieDays"),
    clawbackDays: formData.get("clawbackDays"),
    track2CommissionPct: formData.get("track2CommissionPct"),
    track2ResellerPct: formData.get("track2ResellerPct"),
    track2DurationMonths: formData.get("track2DurationMonths"),
    payoutModel: formData.get("payoutModel") ?? "recurring",
    bountyAmount: formData.get("bountyAmount"),
    minPayout: formData.get("minPayout"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Form sends bounty + min payout in PESOS; store centavos.
  const data = {
    ...parsed.data,
    bountyAmount: Math.round(parsed.data.bountyAmount * 100),
    minPayout: Math.round(parsed.data.minPayout * 100),
  };

  try {
    await systemDb((tx) =>
      tx.programSetting.upsert({
        where: { id: "program" },
        create: { id: "program", ...data },
        update: data,
      }),
    );
  } catch {
    return { error: "Couldn't save. Make sure the referral migration has been run." };
  }
  revalidatePath("/super-admin/referrals");
  return { ok: true };
}
