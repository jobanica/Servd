/**
 * The ₱800/month All Access plan — how every account created from October
 * 2026 on is billed.
 *
 * One price, every feature except the Content Calendar (which stays its own
 * monthly subscription). A 30-day trial, then ₱800 a month. Seven days to pay
 * once a month falls due, then the account is suspended until it does.
 *
 * Kept apart from the older plans ON PURPOSE. Every account that existed
 * before this was introduced is grandfathered on whatever it already had —
 * Free with one-time unlocks, Growth, Business, Lite — and the code paths that
 * bill those are left exactly as they were. Nothing here is reached unless the
 * subscription is on THIS plan, identified by its fixed id, never by its name
 * or its price: other code matches plans by name, and a price can be edited.
 *
 * Pure, so the money rules are testable without a database.
 */

import { ALL_FEATURES, type Feature } from "./features";

/** Fixed id, so nothing has to find this plan by name or by price. */
export const ALL_ACCESS_PLAN_ID = "00000000-0000-0000-0000-0000000000a8";

export const ALL_ACCESS_NAME = "All Access";

/** ₱800, in centavos. */
export const ALL_ACCESS_PRICE = 80_000;

/** The free trial a new account starts on. */
export const ALL_ACCESS_TRIAL_DAYS = 30;

/** Days to pay once a month falls due, before the account is suspended. */
export const ALL_ACCESS_GRACE_DAYS = 7;

/**
 * Sold on their own every month, so never part of the plan — the Content
 * Calendar. The gate strips monthly features from any plan grant anyway; it is
 * left out here as well so the billing page doesn't call it "Included".
 */
const EXCLUDED: readonly Feature[] = ["contentScheduler"];

/** What the plan unlocks: everything, less the excluded list. */
export const ALL_ACCESS_FEATURES: Feature[] = ALL_FEATURES.filter(
  (f) => !EXCLUDED.includes(f),
);

export function isAllAccessPlan(planId: string | null | undefined): boolean {
  return planId === ALL_ACCESS_PLAN_ID;
}

const DAY = 24 * 60 * 60 * 1000;

export interface AllAccessSnapshot {
  status: "trialing" | "active" | "past_due" | "cancelled";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  /**
   * When the unpaid month fell due — the periodStart of its open invoice.
   * Null when there is no open invoice yet.
   */
  openInvoiceDueAt: Date | null;
  /** The restaurant is already suspended. */
  suspended: boolean;
  /** The owner asked to stop at the end of the current month. */
  cancelAtPeriodEnd: boolean;
}

export type AllAccessAction =
  | { action: "none"; reason: string }
  /** A month has fallen due: raise ONE invoice for it, dated at `dueAt`. */
  | { action: "invoice"; dueAt: Date; reason: string }
  /** The grace period is over and it's still unpaid. */
  | { action: "suspend"; reason: string }
  /**
   * A cancellation that has come due. Ends the subscription AND suspends: the
   * feature gate doesn't read subscription status, so a cancelled plan left
   * active would keep every feature for nothing, indefinitely.
   */
  | { action: "cancel"; reason: string };

/**
 * What the daily run should do with one All Access subscription.
 *
 * Three rules the older plans don't have, and the reason this is separate:
 *
 * 1. ONE invoice per unpaid month. The older path raises a fresh open invoice
 *    every day an account is past due, and with no saved card it does that
 *    forever — an owner opening billing after a week would find seven bills
 *    for one month.
 * 2. The grace period is measured from when the month fell due, not from when
 *    the run happened to notice, so a missed cron day can't stretch it.
 * 3. A trial that ends unpaid becomes a bill, not the Free plan. Under the
 *    older plans an unconverted trial quietly turned into a free account; on
 *    this one, every account pays or is suspended.
 */
export function nextAllAccessAction(sub: AllAccessSnapshot, now: Date): AllAccessAction {
  if (sub.status === "cancelled") return { action: "none", reason: "cancelled" };

  if (sub.status === "past_due") {
    if (sub.suspended) return { action: "none", reason: "already suspended" };
    // Past due with no open invoice means the bill was voided or never raised.
    // Raise it now rather than suspend someone with nothing to pay.
    if (!sub.openInvoiceDueAt) return { action: "invoice", dueAt: now, reason: "past due, no invoice" };
    const graceEnds = sub.openInvoiceDueAt.getTime() + ALL_ACCESS_GRACE_DAYS * DAY;
    return now.getTime() >= graceEnds
      ? { action: "suspend", reason: `unpaid ${ALL_ACCESS_GRACE_DAYS} days after due` }
      : { action: "none", reason: "within grace" };
  }

  const boundary = sub.status === "trialing" ? sub.trialEndsAt : sub.currentPeriodEnd;
  if (!boundary) return { action: "none", reason: "no period end" };
  if (now < boundary) return { action: "none", reason: "not yet due" };

  if (sub.cancelAtPeriodEnd) return { action: "cancel", reason: "cancel scheduled" };

  return {
    action: "invoice",
    dueAt: boundary,
    reason: sub.status === "trialing" ? "trial ended" : "month due",
  };
}

/** When an unpaid month will suspend the account. For the billing page. */
export function suspendsAt(openInvoiceDueAt: Date): Date {
  return new Date(openInvoiceDueAt.getTime() + ALL_ACCESS_GRACE_DAYS * DAY);
}
