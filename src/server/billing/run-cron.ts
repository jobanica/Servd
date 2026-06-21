import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getBillingProvider } from "@/server/billing";
import { nextBillingAction } from "@/lib/billing/lifecycle";
import { addMonths } from "@/lib/billing/period";
import {
  consumeCreditForCycle,
  onInvoicePaid,
  clawbackForReferredRestaurant,
} from "@/server/referrals/accrual";

export interface CronSummary {
  processed: number;
  charged: number;
  failed: number;
  awaiting: number;
  suspended: number;
  cancelled: number;
}

/**
 * Daily billing run: for every live subscription, decide (pure lifecycle) and
 * act — charge the saved card, prompt for payment, dun, suspend, or cancel.
 * Idempotent across days: a successful charge advances currentPeriodEnd so the
 * subscription isn't "due" again until the next cycle.
 */
export async function runBillingCron(now: Date = new Date()): Promise<CronSummary> {
  const provider = await getBillingProvider();
  const subs = await systemDb((tx) =>
    tx.subscription.findMany({
      where: { status: { in: ["trialing", "active", "past_due"] } },
      include: { plan: true },
    }),
  );

  const s: CronSummary = { processed: subs.length, charged: 0, failed: 0, awaiting: 0, suspended: 0, cancelled: 0 };

  for (const sub of subs) {
    const decision = nextBillingAction(
      {
        status: sub.status as "trialing" | "active" | "past_due",
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEnd: sub.currentPeriodEnd,
        failedCharges: sub.failedCharges,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        hasSavedCard: !!sub.providerPaymentMethodId,
      },
      now,
    );
    const amount = sub.plan.priceMonthly;

    if (decision.action === "none") continue;

    if (decision.action === "cancel") {
      await systemDb(async (tx) => {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "cancelled" } });
        // Churn clawback — reverse referral rewards if within the window.
        await clawbackForReferredRestaurant(tx, sub.restaurantId, "churned", now);
      });
      s.cancelled++;
      continue;
    }

    // Free plans (₱0) never bill — keep them active and roll the period forward
    // so they're never suspended or invoiced for non-payment.
    if (amount <= 0) {
      const overdue = !sub.currentPeriodEnd || sub.currentPeriodEnd <= now;
      if (sub.status !== "active" || overdue) {
        const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
        await systemDb(async (tx) => {
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: "active", currentPeriodEnd: addMonths(base, 1), failedCharges: 0 },
          });
          await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { status: "active" } });
        });
      }
      continue;
    }

    if (decision.action === "suspend") {
      await systemDb(async (tx) => {
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
        await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { status: "suspended" } });
      });
      s.suspended++;
      continue;
    }

    // A pending referral credit covers this cycle → grant a free month, no charge.
    if (decision.action === "charge" || decision.action === "await_payment") {
      const freeMonth = await systemDb(async (tx) => {
        const consumed = await consumeCreditForCycle(tx, sub.restaurantId, amount, now);
        if (!consumed) return false;
        const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
        await tx.restaurantInvoice.create({
          data: { restaurantId: sub.restaurantId, amount: 0, status: "paid", periodStart: now, periodEnd: addMonths(base, 1), paidAt: now },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "active", currentPeriodEnd: addMonths(base, 1), failedCharges: 0 } });
        await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { status: "active" } });
        return true;
      });
      if (freeMonth) {
        s.charged++;
        continue;
      }
    }

    const canCharge = decision.action === "charge" && provider && sub.providerPaymentMethodId;

    if (decision.action === "await_payment" || !canCharge) {
      await systemDb(async (tx) => {
        await tx.restaurantInvoice.create({
          data: { restaurantId: sub.restaurantId, amount, status: "open", periodStart: now, periodEnd: addMonths(now, 1) },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
      });
      s.awaiting++;
      continue;
    }

    // charge the saved card
    const res = await provider!.chargeSavedCard({
      amount,
      description: `Servd ${sub.plan.name} subscription`,
      paymentMethodId: sub.providerPaymentMethodId!,
      customerId: sub.providerCustomerId ?? undefined,
    });
    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;

    if (res.status === "paid") {
      await systemDb(async (tx) => {
        const inv = await tx.restaurantInvoice.create({
          data: { restaurantId: sub.restaurantId, amount, status: "paid", periodStart: now, periodEnd: addMonths(base, 1), providerRef: res.providerRef, paidAt: now },
          select: { id: true },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "active", currentPeriodEnd: addMonths(base, 1), failedCharges: 0 } });
        await tx.restaurant.update({ where: { id: sub.restaurantId }, data: { status: "active" } });
        // Track-1 referral accrual on a real paid month (same tx).
        await onInvoicePaid(tx, inv.id);
      });
      s.charged++;
    } else {
      await systemDb(async (tx) => {
        await tx.restaurantInvoice.create({
          data: { restaurantId: sub.restaurantId, amount, status: "failed", periodStart: now, periodEnd: addMonths(now, 1), providerRef: res.providerRef },
        });
        await tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due", failedCharges: { increment: 1 } } });
      });
      s.failed++;
    }
  }

  return s;
}
