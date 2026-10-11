"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDormant, DORMANT_DAYS } from "@/lib/billing/dormant";
import { enqueueProductEvent } from "@/server/agent-portal/events";

export type DeleteAccountState = { ok?: boolean; error?: string; message?: string } | null;

/**
 * Permanently delete a dormant restaurant account — menu, orders, staff,
 * settings, everything — and the logins that belonged only to it.
 *
 * Guarded three ways, because nothing brings it back:
 *  - founder (owner) role only, checked here at the action;
 *  - the account must be dormant (no order in DORMANT_DAYS, not a new
 *    signup) — re-checked on the server, whatever the page showed;
 *  - the restaurant's slug must be typed back exactly, so a mis-tap on the
 *    wrong row deletes nothing.
 *
 * The restaurant's own audit log is deleted with it, so the deletion itself
 * is written to the server log (who, what, when).
 */
export async function deleteDormantAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  let actor: { email?: string | null };
  try {
    actor = await requireOwnerAction();
  } catch {
    return { error: "Only the owner account can delete subscribers." };
  }
  const restaurantId = String(formData.get("restaurantId") ?? "");
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();

  const found = await systemDb(async (tx) => {
    const r = await tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
    if (!r) return null;
    const last = await tx.order.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const staff = await tx.staffUser.findMany({ where: { restaurantId }, select: { authUserId: true } });
    return { r, lastOrderAt: last?.createdAt ?? null, authUserIds: staff.map((s) => s.authUserId) };
  });
  if (!found) return { error: "That account no longer exists." };
  const { r, lastOrderAt, authUserIds } = found;

  if (typed !== r.slug.toLowerCase()) {
    return { error: `Type the account's slug, ${r.slug}, exactly to delete it.` };
  }
  if (!isDormant({ createdAt: r.createdAt, lastOrderAt })) {
    return {
      error: `${r.name} isn't dormant (it has orders in the last ${DORMANT_DAYS} days, or is a new signup). Suspend it instead.`,
    };
  }

  try {
    await systemDb(async (tx) => {
      // An agent-portal customer leaves the portal's books too. A no-op for
      // every other account. The outbox has no link to restaurants, so the
      // event survives the delete and goes out on the next tick.
      await enqueueProductEvent(tx, r.id, "customer.cancelled", { reason: "Account deleted by Servd" });
      await tx.restaurant.delete({ where: { id: r.id }, select: { id: true } });
    });
  } catch (e) {
    console.error("[delete-account] failed for", r.id, e);
    return { error: "Couldn't delete the account. Nothing was removed — please try again." };
  }

  // Logins that belonged only to this restaurant. An owner with another
  // branch keeps theirs. Best-effort: a leftover login can't reach anything.
  let removedLogins = 0;
  for (const authUserId of new Set(authUserIds)) {
    try {
      const elsewhere = await systemDb((tx) =>
        tx.staffUser.count({ where: { authUserId } }),
      );
      if (elsewhere > 0) continue;
      await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
      removedLogins++;
    } catch (e) {
      console.error("[delete-account] login cleanup failed:", e);
    }
  }

  console.warn(
    `[delete-account] ${actor.email ?? "owner"} deleted "${r.name}" (${r.slug}, ${r.id}); ` +
      `last order ${lastOrderAt ? lastOrderAt.toISOString() : "never"}; ${removedLogins} login(s) removed`,
  );
  revalidatePath("/super-admin/subscriptions");
  return { ok: true, message: `${r.name} was deleted.` };
}
