"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireSuperAdminAction } from "@/server/tenancy/require-admin";
import { normalizeTutorials, type TutorialsData } from "@/server/tutorials/tutorials";

export type SaveTutorialsResult = { ok: true } | { ok: false; error: string };

/**
 * Replace the whole tutorials hub with the edited tree. Super-admin only. The
 * client sends the full TutorialsData; we normalize (cap lengths/counts, fill
 * ids) before persisting to the platform_settings JSON column.
 */
export async function saveTutorials(data: TutorialsData): Promise<SaveTutorialsResult> {
  try {
    await requireSuperAdminAction();
  } catch {
    return { ok: false, error: "You're not allowed to do that." };
  }
  const clean = normalizeTutorials(data);
  try {
    await systemDb((tx) =>
      tx.platformSetting.upsert({
        where: { id: "platform" },
        create: { id: "platform", tutorials: clean as unknown as Prisma.InputJsonValue },
        update: { tutorials: clean as unknown as Prisma.InputJsonValue },
      }),
    );
  } catch {
    return { ok: false, error: "Couldn't save right now. Make sure the tutorials column exists, then try again." };
  }
  revalidatePath("/tutorials");
  revalidatePath("/super-admin/tutorials");
  return { ok: true };
}
