import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { AGENT_GRACE_DAYS, lapseAction } from "@/lib/agent-portal/lapse";
import { applyPaidCoverage, paidCoverage } from "./coverage";
import { setRestaurantStatus } from "./events";

export interface SweepSummary {
  checked: number;
  pastDue: number;
  suspended: number;
  restored: number;
}

/**
 * suspend_lapsed_accounts: the clock-driven half of agent billing. A lapse is
 * caused by time passing, not by any request, so it is swept on a schedule.
 *
 * In scope: ONLY portal-billed restaurants with a confirmed activation or
 * monthly payment. Every other account — and a portal-billed one that never
 * activated, which is simply not live — is never read here.
 *
 * Lapsed → past_due, nothing else. AGENT_GRACE_DAYS later → suspended, which
 * reports customer.cancelled. The plan is never changed.
 */
export async function suspendLapsedAccounts(now = new Date()): Promise<SweepSummary> {
  const s: SweepSummary = { checked: 0, pastDue: 0, suspended: 0, restored: 0 };

  // Paged: never one unbounded read.
  const PAGE = 500;
  for (let cursor: string | undefined; ; ) {
    const rows = await systemDb((tx) =>
      tx.subscriptionManualPayment.findMany({
        where: { status: "confirmed", ...(cursor ? { restaurantId: { gt: cursor } } : {}) },
        distinct: ["restaurantId"],
        orderBy: { restaurantId: "asc" },
        take: PAGE,
        select: { restaurantId: true },
      }),
    );
    for (const { restaurantId } of rows) {
      s.checked++;
      try {
        const done = await sweepOne(restaurantId, now);
        if (done === "mark_past_due") s.pastDue++;
        else if (done === "suspend") s.suspended++;
        else if (done === "restore") s.restored++;
      } catch (e) {
        // One bad account must not stop the rest.
        console.error("[agent-portal] sweep failed for", restaurantId, e);
      }
    }
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1].restaurantId;
  }
  return s;
}

async function sweepOne(restaurantId: string, now: Date) {
  return systemDb(async (tx) => {
    const agent = await tx.agentAccount.findUnique({ where: { restaurantId }, select: { restaurantId: true } });
    if (!agent) return "none" as const;

    const [coverage, sub, restaurant] = await Promise.all([
      paidCoverage(tx, restaurantId),
      tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, trialEndsAt: true },
      }),
      tx.restaurant.findUnique({ where: { id: restaurantId }, select: { status: true } }),
    ]);
    if (!restaurant) return "none" as const;

    const action = lapseAction(
      {
        coverage,
        trialEndsAt: sub?.status === "trialing" ? sub.trialEndsAt : null,
        subscriptionStatus: sub?.status ?? null,
        suspended: restaurant.status === "suspended",
      },
      now,
    );

    if (action === "mark_past_due" && sub) {
      await tx.subscription.update({ where: { id: sub.id }, data: { status: "past_due" }, select: { id: true } });
    } else if (action === "suspend") {
      await setRestaurantStatus(
        tx,
        restaurantId,
        "suspended",
        `No payment received within ${AGENT_GRACE_DAYS} days of the paid period ending.`,
      );
    } else if (action === "restore") {
      await applyPaidCoverage(tx, restaurantId, now);
    }
    return action;
  });
}
