import "server-only";
import type { Prisma } from "@prisma/client";
import {
  track1CreditAmount,
  isWithinClawbackWindow,
  creditCoversCycle,
  commissionForInvoice,
  periodKey,
  type PartnerTier,
  type PayoutModel,
} from "@/lib/referrals/rules";

/** Read the program settings within the caller's transaction (no nested tx). */
async function readSettings(tx: Prisma.TransactionClient) {
  const row = await tx.programSetting.findUnique({ where: { id: "program" } });
  return {
    track1CreditMonths: row?.track1CreditMonths ?? 1,
    clawbackDays: row?.clawbackDays ?? 60,
    track2CommissionPct: row?.track2CommissionPct ?? 25,
    track2ResellerPct: row?.track2ResellerPct ?? 35,
    track2DurationMonths: row?.track2DurationMonths ?? 12,
    bountyAmount: row?.bountyAmount ?? 0,
    payoutModel: (row?.payoutModel as PayoutModel) ?? "recurring",
  };
}

/**
 * Track-1 accrual: when a referred restaurant pays its FIRST full month, grant
 * BOTH the referrer and the referred restaurant an account credit. Idempotent —
 * guarded by `referral.firstPaidAt` and a unique (restaurantId, sourceReferralId).
 *
 * MUST run inside the same transaction that marked the invoice paid, so webhook
 * retries can't double-pay. Never accrues on trials (no invoice) or ₱0 invoices
 * (credit-funded free months).
 */
export async function onInvoicePaid(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.restaurantInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, restaurantId: true, amount: true, status: true },
  });
  if (!invoice || invoice.status !== "paid" || invoice.amount <= 0) return;

  const referral = await tx.referral.findUnique({
    where: { referredRestaurantId: invoice.restaurantId },
    select: { id: true, status: true, firstPaidAt: true, referrerRestaurantId: true, partnerId: true },
  });
  if (!referral) return;
  if (referral.status === "churned") return;

  const settings = await readSettings(tx);
  const wasFirstPaid = referral.firstPaidAt == null;

  // Paid months so far (incl. this invoice, already marked paid). Counting
  // instead of incrementing keeps it idempotent across webhook retries.
  const paidMonthCount = await tx.restaurantInvoice.count({
    where: { restaurantId: invoice.restaurantId, status: "paid", amount: { gt: 0 } },
  });

  await tx.referral.update({
    where: { id: referral.id },
    data: { firstPaidAt: referral.firstPaidAt ?? new Date(), status: "paying", paidMonths: paidMonthCount },
  });

  // --- Track 1: restaurant-to-restaurant credit (first paid month only) ---
  if (referral.referrerRestaurantId && wasFirstPaid) {
    const amount = track1CreditAmount(invoice.amount, settings.track1CreditMonths);
    if (amount > 0) {
      await tx.accountCredit.createMany({
        data: [
          { restaurantId: referral.referrerRestaurantId, amount, reason: "Referral reward — you referred a restaurant", sourceReferralId: referral.id },
          { restaurantId: invoice.restaurantId, amount, reason: "Referral reward — you were referred", sourceReferralId: referral.id },
        ],
        skipDuplicates: true,
      });
    }
    await tx.referralEvent.create({
      data: { referralId: referral.id, type: "first_paid", detailJson: { invoiceId: invoice.id, amount } },
    });
  }

  // --- Track 2: partner commission (recurring or bounty) ---
  if (referral.partnerId) {
    const partner = await tx.partner.findUnique({
      where: { id: referral.partnerId },
      select: { tier: true, status: true },
    });
    if (partner && partner.status === "approved") {
      const bountyAlreadyGranted = (await tx.commission.count({ where: { referralId: referral.id } })) > 0;
      const amount = commissionForInvoice({
        payoutModel: settings.payoutModel,
        tier: (partner.tier as PartnerTier) ?? "affiliate",
        paidMonthCount,
        invoiceAmount: invoice.amount,
        affiliatePct: settings.track2CommissionPct,
        resellerPct: settings.track2ResellerPct,
        durationMonths: settings.track2DurationMonths,
        bountyAmount: settings.bountyAmount,
        bountyAlreadyGranted,
      });
      if (amount && amount > 0) {
        try {
          await tx.commission.create({
            data: {
              partnerId: referral.partnerId,
              referralId: referral.id,
              invoiceId: invoice.id,
              amount,
              period: periodKey(new Date()),
              status: "payable",
            },
          });
          await tx.referralEvent.create({
            data: { referralId: referral.id, type: "commission_accrued", detailJson: { invoiceId: invoice.id, amount, month: paidMonthCount } },
          });
        } catch {
          // unique(referralId, invoiceId) — webhook retry; already accrued.
        }
      }
    }
  }
}

/** Reverse the rewards tied to a referral (clawback). Pending credits are
 *  reversed; already-applied credits are flagged for manual handling. */
export async function reverseRewardsForReferral(
  tx: Prisma.TransactionClient,
  referralId: string,
  reason: string,
): Promise<void> {
  await tx.referral.update({ where: { id: referralId }, data: { status: "churned" } });

  const reversed = await tx.accountCredit.updateMany({
    where: { sourceReferralId: referralId, status: "pending" },
    data: { status: "reversed" },
  });
  const alreadyApplied = await tx.accountCredit.count({
    where: { sourceReferralId: referralId, status: "applied" },
  });

  // Track 2: reverse not-yet-paid commissions (paid ones are flagged only).
  const clawedCommissions = await tx.commission.updateMany({
    where: { referralId, status: "payable" },
    data: { status: "clawed_back" },
  });
  const alreadyPaidCommissions = await tx.commission.count({
    where: { referralId, status: "paid" },
  });

  await tx.referralEvent.create({
    data: {
      referralId,
      type: "clawback",
      detailJson: {
        reason,
        reversedPending: reversed.count,
        alreadyApplied,
        clawedCommissions: clawedCommissions.count,
        alreadyPaidCommissions,
      },
    },
  });
}

/** Clawback by a refunded invoice's gateway ref (refund webhook). */
export async function clawbackByInvoiceProviderRef(
  tx: Prisma.TransactionClient,
  providerRef: string,
  reason: string,
  now: Date = new Date(),
): Promise<boolean> {
  const invoice = await tx.restaurantInvoice.findFirst({
    where: { providerRef },
    select: { restaurantId: true },
  });
  if (!invoice) return false;
  return clawbackForReferredRestaurant(tx, invoice.restaurantId, reason, now);
}

/** Clawback when a referred restaurant churns within the clawback window. */
export async function clawbackForReferredRestaurant(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  reason: string,
  now: Date = new Date(),
): Promise<boolean> {
  const referral = await tx.referral.findUnique({
    where: { referredRestaurantId: restaurantId },
    select: { id: true, firstPaidAt: true, status: true },
  });
  if (!referral || !referral.firstPaidAt || referral.status === "churned") return false;

  const settings = await readSettings(tx);
  if (!isWithinClawbackWindow(referral.firstPaidAt, now, settings.clawbackDays)) return false;

  await reverseRewardsForReferral(tx, referral.id, reason);
  return true;
}

/**
 * Consume one pending account credit to cover a billing cycle (a free month).
 * Returns true if a credit covered the cycle. Caller then bills ₱0.
 */
export async function consumeCreditForCycle(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  cycleAmount: number,
  now: Date = new Date(),
): Promise<boolean> {
  const credit = await tx.accountCredit.findFirst({
    where: { restaurantId, status: "pending" },
    orderBy: { createdAt: "asc" },
    select: { id: true, amount: true, sourceReferralId: true },
  });
  if (!credit || !creditCoversCycle(credit.amount, cycleAmount)) return false;

  await tx.accountCredit.update({
    where: { id: credit.id },
    data: { status: "applied", appliedAt: now },
  });
  await tx.referralEvent.create({
    data: {
      referralId: credit.sourceReferralId,
      type: "credit_applied",
      detailJson: { restaurantId, amount: credit.amount },
    },
  });
  return true;
}
