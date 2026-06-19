"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireStaff, requireSuperAdmin } from "@/server/tenancy/current-user";

export type FeedbackState = { ok?: boolean; error?: string } | null;

/** A restaurant user sends feedback / a recommendation about Servd itself. */
export async function submitPlatformFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return { error: "Please sign in to send feedback." };
  }
  const message = String(formData.get("message") ?? "").trim();
  const ratingRaw = Number(formData.get("rating") ?? 0);
  const rating = ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
  if (message.length < 3) return { error: "Please write your feedback first." };

  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { id: staff.restaurantId },
        select: { name: true, displayName: true },
      }),
    );
    await systemDb((tx) =>
      tx.platformFeedback.create({
        data: {
          restaurantId: staff.restaurantId,
          restaurantName: r?.displayName || r?.name || null,
          authorEmail: staff.email,
          rating,
          message,
        },
      }),
    );
  } catch {
    return { error: "Couldn't send your feedback. Please try again." };
  }
  return { ok: true };
}

/** Super-admin: mark a feedback item resolved / unresolved. */
export async function setFeedbackResolved(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const resolved = formData.get("resolved") === "true";
  await systemDb((tx) => tx.platformFeedback.update({ where: { id }, data: { resolved } }));
  revalidatePath("/super-admin/feedback");
}
