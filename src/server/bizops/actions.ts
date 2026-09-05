"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { logTouch } from "@/server/crm/actions";
import { logEvent } from "@/server/bizops/events";

/**
 * Recording that a chase went out.
 *
 * The two tracks record it differently, and that's deliberate rather than
 * untidy. An outreach prospect already has a sequence that owns its cadence —
 * `logTouch` advances the step, stamps the touch and schedules the next due
 * date — and reimplementing any of that here would give the CRM board and this
 * screen two different opinions about the same client.
 *
 * A DIY preview has no such row to advance. Its chase is recorded as an event,
 * which is what the timeline is for, and the due list counts those events back
 * to work out how many chases have gone and when the next is due.
 */
export async function markFollowedUp(
  track: "outreach" | "diy_preview",
  id: string,
): Promise<{ ok: boolean }> {
  const admin = await requireSuperAdmin();

  if (track === "outreach") {
    // The CRM owns the cadence. Let it.
    await logTouch(id).catch(() => ({ error: "logTouch failed" }));
    await logEvent({
      leadId: id,
      eventType: "note",
      actor: admin.email,
      meta: { kind: "follow_up_sent", track },
    });
  } else {
    await logEvent({
      restaurantId: id,
      eventType: "note",
      actor: admin.email,
      meta: { kind: "follow_up_sent", track },
    });
  }

  revalidatePath("/super-admin/bizops/follow-ups");
  revalidatePath("/super-admin/bizops");
  return { ok: true };
}
