/**
 * What paid-up means for an agent-referred restaurant, and what the daily
 * sweep does when it stops being true. Pure.
 *
 * Coverage is RECOMPUTED from every confirmed payment, never incremented, so a
 * redelivered confirmation changes nothing and a reversal is correct for free.
 * Overlapping months do not stack (coverageEnd, from the connection kit).
 *
 * No money in here: what an owner owes is the portal's to say, read from it
 * when the billing page renders. Servd only knows which months are paid.
 */
import { addMonthKey, coverageEnd, manilaMonthKey, manilaMonthStart } from "@/lib/agent-kit/billing";

export const AGENT_GRACE_DAYS = 7;
/** Start nagging this many days before paid coverage runs out. */
export const AGENT_RENEWAL_NOTICE_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ConfirmedPayment {
  type: string; // "activation" | "monthly"
  billingMonthStart: Date | null;
  monthsCovered: number;
  /** When CANVEXIA confirmed it. Dates the activation's month. */
  decidedAt?: Date | null;
}

export interface Coverage {
  activationConfirmed: boolean;
  /**
   * The activation covers the Manila month it was confirmed in; monthly
   * payments are due from the 1st of the next. This is when that ends. Null
   * without a confirmed activation.
   */
  activationCoversUntil: Date | null;
  /** Any confirmed monthly payment at all. */
  hasMonthly: boolean;
  /** When the last paid month ends (Manila). Null with no monthly payment. */
  paidUntil: Date | null;
}

export function coverageOf(confirmed: ConfirmedPayment[]): Coverage {
  const monthly = confirmed.filter((p) => p.type === "monthly" && p.billingMonthStart);
  const activation = confirmed.find((p) => p.type === "activation");
  return {
    activationConfirmed: !!activation,
    activationCoversUntil:
      activation?.decidedAt != null
        ? manilaMonthStart(addMonthKey(manilaMonthKey(activation.decidedAt), 1))
        : null,
    hasMonthly: monthly.length > 0,
    paidUntil: coverageEnd(
      monthly.map((p) => ({ billingMonthStart: p.billingMonthStart!, monthsCovered: p.monthsCovered })),
    ),
  };
}

/** The end of everything paid for — activation month or monthly coverage. */
export function paidThrough(c: Coverage): Date | null {
  const ends = [c.paidUntil, c.activationCoversUntil].filter((d): d is Date => !!d);
  return ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
}

/**
 * Entitled while something paid for is still running: the activation's own
 * month, or a paid monthly period. An activation from last January is not a
 * paid-up subscription today.
 */
export function isEntitled(c: Coverage, now: Date): boolean {
  const end = paidThrough(c);
  return !!end && end > now;
}

export interface LapseInput {
  coverage: Coverage;
  /** A trial still running keeps the account open regardless. */
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
  suspended: boolean;
}

export type LapseAction = "none" | "mark_past_due" | "suspend" | "restore";

/** When this account's access runs out: the later of what's paid and the trial. */
export function accessEnds(input: Pick<LapseInput, "coverage" | "trialEndsAt">): Date | null {
  const ends = [paidThrough(input.coverage), input.trialEndsAt].filter((d): d is Date => !!d);
  return ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
}

/** The moment the sweep suspends an account whose access ended at `end`. */
export function suspendsAt(end: Date): Date {
  return new Date(end.getTime() + AGENT_GRACE_DAYS * DAY_MS);
}

/**
 * One account's turn in the sweep.
 *
 * In scope once an activation or a monthly payment has been confirmed — before
 * that there is no paid period to lapse from (a restaurant that never
 * activated is simply not live), and this never acts on a guess. Lapsed →
 * past_due at once and nothing else; AGENT_GRACE_DAYS later → suspended. Day 6
 * is still grace; day 7 is not. The plan is never touched: suspension is the
 * only consequence, and paying again undoes it.
 */
export function lapseAction(input: LapseInput, now: Date): LapseAction {
  if (!inScope(input.coverage)) return "none";
  const end = accessEnds(input);
  if (!end) return "none";

  if (now < end) {
    return input.suspended || input.subscriptionStatus === "past_due" ? "restore" : "none";
  }
  const daysLate = Math.floor((now.getTime() - end.getTime()) / DAY_MS);
  if (daysLate >= AGENT_GRACE_DAYS) return input.suspended ? "none" : "suspend";
  return input.subscriptionStatus === "past_due" ? "none" : "mark_past_due";
}

function inScope(c: Coverage): boolean {
  return c.activationConfirmed || c.hasMonthly;
}

export type OwnerNotice =
  | { kind: "not_live" }
  | { kind: "renew_soon"; endsAt: Date; daysLeft: number }
  | { kind: "past_due"; endedAt: Date; suspendsAt: Date; daysLeft: number }
  | { kind: "suspended" }
  | null;

/**
 * The warning an owner sees before (and after) the sweep acts — or, before
 * activation, that the restaurant isn't live yet.
 */
export function ownerNotice(input: LapseInput & { live?: boolean }, now: Date): OwnerNotice {
  if (input.suspended) return { kind: "suspended" };
  if (input.live === false && !input.coverage.activationConfirmed) return { kind: "not_live" };
  if (!inScope(input.coverage)) return null;
  const end = accessEnds(input);
  if (!end) return null;
  if (now < end) {
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
    return daysLeft <= AGENT_RENEWAL_NOTICE_DAYS ? { kind: "renew_soon", endsAt: end, daysLeft } : null;
  }
  const at = suspendsAt(end);
  return {
    kind: "past_due",
    endedAt: end,
    suspendsAt: at,
    daysLeft: Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY_MS)),
  };
}

/** What the owner typed as a bank reference → the one form it is stored in. */
export function normalizeBankReference(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}
