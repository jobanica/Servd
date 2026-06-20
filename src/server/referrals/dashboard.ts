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
  ready: boolean; // false when the referral migration hasn't been run yet
  code: string | null;
  referrals: ReferralRow[];
  pendingCredit: number; // centavos
  appliedCredit: number; // centavos
}

/**
 * The referrer's own program view. Filtered strictly by referrerRestaurantId /
 * restaurantId, so it only ever returns this restaurant's data (referred-
 * restaurant names are cross-tenant, so this read is server-authorized here).
 * Degrades to `ready: false` if the referral tables aren't migrated yet.
 */
export async function getReferralDashboard(restaurantId: string): Promise<ReferralDashboard> {
  try {
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
      ready: true,
      code,
      referrals: data.referrals,
      pendingCredit: sum("pending"),
      appliedCredit: sum("applied"),
    };
  } catch {
    // Referral tables not migrated yet — show a friendly "setup" state.
    return { ready: false, code: null, referrals: [], pendingCredit: 0, appliedCredit: 0 };
  }
}
