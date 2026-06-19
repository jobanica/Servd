import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getOrCreateRestaurantReferralCode } from "./codes";

export interface ReferralRow {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  firstPaidAt: Date | null;
}

export interface ReferralDashboard {
  code: string;
  referrals: ReferralRow[];
  pendingCredit: number; // centavos
  appliedCredit: number; // centavos
}

/**
 * The referrer's own program view. Filtered strictly by referrerRestaurantId /
 * restaurantId, so it only ever returns this restaurant's data (referred-
 * restaurant names are cross-tenant, so this read is server-authorized here).
 */
export async function getReferralDashboard(restaurantId: string): Promise<ReferralDashboard> {
  const code = await getOrCreateRestaurantReferralCode(restaurantId);

  const data = await systemDb(async (tx) => {
    const referrals = await tx.referral.findMany({
      where: { referrerRestaurantId: restaurantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, referredRestaurantId: true, status: true, createdAt: true, firstPaidAt: true },
    });

    const names = referrals.length
      ? await tx.restaurant.findMany({
          where: { id: { in: referrals.map((r) => r.referredRestaurantId) } },
          select: { id: true, name: true, displayName: true },
        })
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.displayName || n.name]));

    const credits = await tx.accountCredit.findMany({
      where: { restaurantId, sourceReferralId: { not: null } },
      select: { amount: true, status: true },
    });

    return {
      referrals: referrals.map((r) => ({
        id: r.id,
        name: nameById.get(r.referredRestaurantId) ?? "A restaurant",
        status: r.status,
        createdAt: r.createdAt,
        firstPaidAt: r.firstPaidAt,
      })),
      credits,
    };
  });

  const sum = (status: string) =>
    data.credits.filter((c) => c.status === status).reduce((s, c) => s + c.amount, 0);

  return {
    code,
    referrals: data.referrals,
    pendingCredit: sum("pending"),
    appliedCredit: sum("applied"),
  };
}
