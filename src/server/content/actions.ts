"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";

const CALENDAR_PATH = "/super-admin/content-engine/calendar";

/**
 * Reschedule a script to a given day (or clear its schedule). Super-admin only.
 * `isoDate` is a yyyy-mm-dd day string; null removes it from the calendar.
 */
export async function rescheduleScript(
  id: string,
  isoDate: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  if (!id) return { error: "Missing script." };

  let when: Date | null = null;
  if (isoDate) {
    // Anchor to local noon so the date doesn't drift across timezones.
    const d = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return { error: "Invalid date." };
    when = d;
  }

  try {
    await systemDb((tx) =>
      tx.contentScript.update({
        where: { id },
        data: { scheduledFor: when },
        select: { id: true },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't reschedule." };
  }
  revalidatePath(CALENDAR_PATH);
  return { ok: true };
}
