"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { parseBonusTiers } from "@/server/referrals/settings";

export type SettingsState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  track1CreditMonths: z.coerce.number().int().min(0).max(12),
  cookieDays: z.coerce.number().int().min(1).max(180),
  clawbackDays: z.coerce.number().int().min(0).max(365),
  commissionPctYear1: z.coerce.number().int().min(0).max(100),
  commissionPctOngoing: z.coerce.number().int().min(0).max(100),
  track2DurationMonths: z.coerce.number().int().min(0).max(60), // year-1 boundary
  payoutModel: z.enum(["recurring", "bounty"]),
  bountyAmount: z.coerce.number().int().min(0), // pesos (form) → centavos
  minPayout: z.coerce.number().int().min(0), // pesos (form) → centavos
  withholdingPct: z.coerce.number().int().min(0).max(100),
  bonusTiers: z.string().optional(), // JSON [{activeReferrals, amountPesos}]
});

/** Parse the bonus-tier editor's JSON (amounts in PESOS) → sanitized centavos. */
function bonusTiersFromForm(raw: string | undefined) {
  if (!raw) return undefined;
  try {
    const arr = JSON.parse(raw) as Array<{ activeReferrals: unknown; amountPesos: unknown }>;
    const centavos = arr.map((t) => ({
      activeReferrals: Number(t.activeReferrals),
      amount: Math.round(Number(t.amountPesos) * 100),
    }));
    return parseBonusTiers(centavos); // sanitizes + sorts
  } catch {
    return undefined; // leave tiers unchanged on bad input
  }
}

/** Super-admin: update the program settings (singleton). */
export async function updateProgramSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireSuperAdmin();
  const parsed = schema.safeParse({
    track1CreditMonths: formData.get("track1CreditMonths"),
    cookieDays: formData.get("cookieDays"),
    clawbackDays: formData.get("clawbackDays"),
    commissionPctYear1: formData.get("commissionPctYear1"),
    commissionPctOngoing: formData.get("commissionPctOngoing"),
    track2DurationMonths: formData.get("track2DurationMonths"),
    payoutModel: formData.get("payoutModel") ?? "recurring",
    bountyAmount: formData.get("bountyAmount"),
    minPayout: formData.get("minPayout"),
    withholdingPct: formData.get("withholdingPct") ?? 0,
    bonusTiers: formData.get("bonusTiers") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { bonusTiers, ...scalars } = parsed.data;
  const tiers = bonusTiersFromForm(bonusTiers);

  // Form sends bounty + min payout in PESOS; store centavos.
  const data = {
    ...scalars,
    bountyAmount: Math.round(scalars.bountyAmount * 100),
    minPayout: Math.round(scalars.minPayout * 100),
    ...(tiers ? { bonusTiersJson: tiers as unknown as Prisma.InputJsonValue } : {}),
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
