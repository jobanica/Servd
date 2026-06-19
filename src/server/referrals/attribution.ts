import "server-only";
import type { Prisma } from "@prisma/client";
import { normalizeCode, validateAttribution } from "@/lib/referrals/rules";

/**
 * Persist a referral attribution at signup. MUST run inside the signup's
 * systemDb transaction (it reads cross-tenant code/staff rows). Blocks
 * self-referral and records a fraud event instead of a referral when blocked.
 */
export async function recordReferralAtSignup(
  tx: Prisma.TransactionClient,
  args: { newRestaurantId: string; newOwnerEmail: string; codeValue: string | null | undefined },
): Promise<void> {
  const code = normalizeCode(args.codeValue ?? "");
  if (!code) return;

  const codeRow = await tx.referralCode.findUnique({
    where: { code },
    select: { id: true, ownerType: true, restaurantId: true, active: true },
  });
  if (!codeRow) return; // unknown code → ignore silently
  // Track 1 only handles restaurant-owned codes; partner codes are Track 2.
  if (codeRow.ownerType !== "restaurant") return;

  // Referrer admin emails for the self-referral check.
  const referrerStaff = codeRow.restaurantId
    ? await tx.staffUser.findMany({
        where: { restaurantId: codeRow.restaurantId, role: "admin" },
        select: { email: true },
      })
    : [];
  const referrerEmails = referrerStaff
    .map((s) => s.email)
    .filter((e): e is string => !!e);

  const verdict = validateAttribution({
    codeOwnerRestaurantId: codeRow.restaurantId,
    codeActive: codeRow.active,
    newRestaurantId: args.newRestaurantId,
    newOwnerEmail: args.newOwnerEmail,
    referrerEmails,
  });

  if (!verdict.ok) {
    await tx.referralEvent.create({
      data: {
        type: "self_referral_blocked",
        detailJson: { reason: verdict.reason, code, newRestaurantId: args.newRestaurantId },
      },
    });
    return;
  }

  try {
    const referral = await tx.referral.create({
      data: {
        referralCodeId: codeRow.id,
        referrerRestaurantId: codeRow.restaurantId,
        referredRestaurantId: args.newRestaurantId,
        status: "signed_up",
      },
      select: { id: true },
    });
    await tx.referralEvent.create({
      data: { referralId: referral.id, type: "attribution", detailJson: { code } },
    });
  } catch {
    // unique(referredRestaurantId) — already attributed; keep the existing one.
  }
}
