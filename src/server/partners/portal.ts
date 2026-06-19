import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { generateCode } from "@/lib/referrals/rules";

/** The partner's referral code, creating one once they're approved. */
export async function getOrCreatePartnerCode(partnerId: string): Promise<string> {
  return systemDb(async (tx) => {
    const existing = await tx.referralCode.findFirst({
      where: { partnerId, ownerType: "partner" },
      select: { code: true },
    });
    if (existing) return existing.code;
    for (let i = 0; i < 6; i++) {
      const code = generateCode();
      try {
        await tx.referralCode.create({ data: { code, ownerType: "partner", partnerId } });
        return code;
      } catch {
        /* collision — retry */
      }
    }
    throw new Error("Could not generate a partner code.");
  });
}

export interface PartnerReferralRow {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
}

export interface PartnerDashboard {
  code: string | null;
  referrals: PartnerReferralRow[];
  accrued: number; // payable commissions (centavos)
  paid: number; // paid commissions (centavos)
  payouts: { id: string; period: string; amount: number; status: string; paidAt: Date | null }[];
}

/** Partner portal data — strictly filtered by partnerId (app-level isolation). */
export async function getPartnerDashboard(
  partnerId: string,
  approved: boolean,
): Promise<PartnerDashboard> {
  const code = approved ? await getOrCreatePartnerCode(partnerId) : null;

  return systemDb(async (tx) => {
    const referrals = await tx.referral.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, referredRestaurantId: true, status: true, createdAt: true },
    });
    const names = referrals.length
      ? await tx.restaurant.findMany({
          where: { id: { in: referrals.map((r) => r.referredRestaurantId) } },
          select: { id: true, name: true, displayName: true },
        })
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.displayName || n.name]));

    const commissions = await tx.commission.findMany({
      where: { partnerId },
      select: { amount: true, status: true },
    });
    const accrued = commissions.filter((c) => c.status === "payable").reduce((s, c) => s + c.amount, 0);
    const paid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);

    const payouts = await tx.payout.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, period: true, amount: true, status: true, paidAt: true },
    });

    return {
      code,
      referrals: referrals.map((r) => ({
        id: r.id,
        name: nameById.get(r.referredRestaurantId) ?? "A restaurant",
        status: r.status,
        createdAt: r.createdAt,
      })),
      accrued,
      paid,
      payouts,
    };
  });
}
