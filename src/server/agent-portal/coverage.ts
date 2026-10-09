import "server-only";
import type { Prisma } from "@prisma/client";
import { coverageOf, isEntitled, type Coverage } from "@/lib/agent-portal/lapse";
import { setRestaurantStatus } from "./events";

type Tx = Prisma.TransactionClient;

/** Recomputed from every confirmed payment — never incremented. */
export async function paidCoverage(tx: Tx, restaurantId: string): Promise<Coverage> {
  const confirmed = await tx.subscriptionManualPayment.findMany({
    where: { restaurantId, status: "confirmed" },
    select: { type: true, billingMonthStart: true, monthsCovered: true },
  });
  return coverageOf(confirmed);
}

/** paid_coverage_end: when the last confirmed month ends, or null. */
export async function paidCoverageEnd(tx: Tx, restaurantId: string): Promise<Date | null> {
  return (await paidCoverage(tx, restaurantId)).paidUntil;
}

/**
 * apply_paid_coverage: make the account match what has been paid for. Run in
 * the transaction that changed a payment.
 *
 * Entitled → the subscription is active (or still trialing) through the paid
 * period, and a suspension is lifted — which reports customer.reactivated.
 * Not entitled → only the paid-through date is recorded. Suspending is never
 * done here: only the daily sweep suspends, because only the sweep cannot
 * arrive out of order.
 */
export async function applyPaidCoverage(tx: Tx, restaurantId: string, now: Date): Promise<Coverage> {
  const coverage = await paidCoverage(tx, restaurantId);
  const sub = await tx.subscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, trialEndsAt: true, currentPeriodEnd: true },
  });

  if (isEntitled(coverage, now)) {
    if (sub) {
      const trialRunning = sub.status === "trialing" && !!sub.trialEndsAt && sub.trialEndsAt > now;
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: trialRunning ? "trialing" : "active",
          currentPeriodEnd: coverage.paidUntil ?? sub.currentPeriodEnd,
        },
        select: { id: true },
      });
    }
    const r = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { status: true } });
    if (r?.status === "suspended") {
      await setRestaurantStatus(tx, restaurantId, "active");
    }
  } else if (sub && coverage.paidUntil) {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { currentPeriodEnd: coverage.paidUntil },
      select: { id: true },
    });
  }
  return coverage;
}
