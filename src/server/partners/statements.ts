import "server-only";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { decryptJson } from "@/lib/crypto/secrets";
import { getProgramSettings } from "@/server/referrals/settings";
import { withholdingAmount, netPayout } from "@/lib/partners/statement";

export interface StatementLine {
  label: string;
  detail: string;
  amount: number; // centavos
}

export interface PayoutStatement {
  payoutId: string;
  period: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  partner: {
    name: string;
    email: string;
    tier: string;
    payoutMethod: string | null;
    payoutDetails: string | null; // decrypted
    taxInfo: string | null; // decrypted
  };
  commissionLines: StatementLine[];
  bonusLines: StatementLine[];
  gross: number;
  withholdingPct: number;
  withholding: number;
  net: number;
}

function safeDecrypt(enc: string | null, key: "details" | "tax"): string | null {
  if (!enc) return null;
  try {
    const obj = decryptJson<Record<string, string>>(enc);
    return obj?.[key] ?? null;
  } catch {
    return null; // key missing / tampered — omit rather than fail the statement
  }
}

/**
 * Build a per-partner, per-period payout statement (super-admin only). Includes
 * the commission + bonus line items, decrypted payout/tax details for reporting,
 * and a CONFIGURABLE withholding line (not tax advice). Returns null if missing.
 */
export async function getPayoutStatement(payoutId: string): Promise<PayoutStatement | null> {
  await requireSuperAdmin();
  if (!payoutId) return null;
  const settings = await getProgramSettings();

  try {
    return await systemDb(async (tx) => {
      const payout = await tx.payout.findUnique({
        where: { id: payoutId },
        select: { id: true, partnerId: true, period: true, status: true, paidAt: true, createdAt: true, amount: true },
      });
      if (!payout) return null;

      const partner = await tx.partner.findUnique({
        where: { id: payout.partnerId },
        select: {
          name: true, email: true, tier: true, payoutMethod: true,
          payoutDetailsEnc: true, taxInfoEnc: true,
        },
      });
      if (!partner) return null;

      const commissions = await tx.commission.findMany({
        where: { payoutId },
        select: { amount: true, period: true, referralId: true },
      });
      const bonuses = await tx.partnerBonus.findMany({
        where: { payoutId },
        select: { amount: true, tierCount: true },
      });

      // Resolve referral → restaurant name for readable commission lines.
      const referralIds = [...new Set(commissions.map((c) => c.referralId))];
      const referrals = referralIds.length
        ? await tx.referral.findMany({
            where: { id: { in: referralIds } },
            select: { id: true, referredRestaurantId: true },
          })
        : [];
      const restIds = referrals.map((r) => r.referredRestaurantId);
      const rests = restIds.length
        ? await tx.restaurant.findMany({ where: { id: { in: restIds } }, select: { id: true, name: true, displayName: true } })
        : [];
      const restByReferral = new Map(
        referrals.map((r) => {
          const rest = rests.find((x) => x.id === r.referredRestaurantId);
          return [r.id, rest ? rest.displayName || rest.name : "A restaurant"];
        }),
      );

      const commissionLines: StatementLine[] = commissions.map((c) => ({
        label: restByReferral.get(c.referralId) ?? "A restaurant",
        detail: `Commission · ${c.period}`,
        amount: c.amount,
      }));
      const bonusLines: StatementLine[] = bonuses.map((b) => ({
        label: `Milestone bonus`,
        detail: `${b.tierCount} active referrals`,
        amount: b.amount,
      }));

      const gross = payout.amount;
      const withholding = withholdingAmount(gross, settings.withholdingPct);

      return {
        payoutId: payout.id,
        period: payout.period,
        status: payout.status,
        paidAt: payout.paidAt,
        createdAt: payout.createdAt,
        partner: {
          name: partner.name,
          email: partner.email,
          tier: partner.tier,
          payoutMethod: partner.payoutMethod,
          payoutDetails: safeDecrypt(partner.payoutDetailsEnc, "details"),
          taxInfo: safeDecrypt(partner.taxInfoEnc, "tax"),
        },
        commissionLines,
        bonusLines,
        gross,
        withholdingPct: settings.withholdingPct,
        withholding,
        net: netPayout(gross, settings.withholdingPct),
      };
    });
  } catch {
    return null;
  }
}
