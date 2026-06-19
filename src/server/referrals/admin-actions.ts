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
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    await systemDb((tx) =>
      tx.programSetting.upsert({
        where: { id: "program" },
        create: { id: "program", ...parsed.data },
        update: parsed.data,
      }),
    );
  } catch {
    return { error: "Couldn't save. Make sure the referral migration has been run." };
  }
  revalidatePath("/super-admin/referrals");
  return { ok: true };
}
