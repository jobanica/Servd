/**
 * Referral program — pure decision logic (no DB, no IO), so the fraud and
 * accrual rules are deterministically unit-testable. The server modules call
 * these and persist the result.
 */

/** Normalize a code for storage/compare: uppercase, strip non-alphanumerics. */
export function normalizeCode(input: string): string {
  return (input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Generate a readable code (no ambiguous chars) from a random source. */
export function generateCode(
  rand: () => number = Math.random,
  len = 7,
): string {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return out;
}

export type AttributionInput = {
  /** The code's owner restaurant (Track 1). Null for partner-owned codes. */
  codeOwnerRestaurantId: string | null;
  codeActive: boolean;
  /** The restaurant being created from this referral. */
  newRestaurantId: string;
  /** Owner email of the new restaurant. */
  newOwnerEmail: string;
  /** Known emails of the referrer (its admin staff). */
  referrerEmails: string[];
};

export type AttributionResult =
  | { ok: true }
  | { ok: false; reason: "inactive" | "self_restaurant" | "self_email" };

/**
 * Validate a referral attribution. Blocks self-referral: a code can't refer its
 * own restaurant, and the new owner email can't match the referrer's.
 */
export function validateAttribution(input: AttributionInput): AttributionResult {
  if (!input.codeActive) return { ok: false, reason: "inactive" };

  if (
    input.codeOwnerRestaurantId &&
    input.codeOwnerRestaurantId === input.newRestaurantId
  ) {
    return { ok: false, reason: "self_restaurant" };
  }

  const newEmail = (input.newOwnerEmail ?? "").trim().toLowerCase();
  const referrer = input.referrerEmails.map((e) => (e ?? "").trim().toLowerCase());
  if (newEmail && referrer.includes(newEmail)) {
    return { ok: false, reason: "self_email" };
  }

  return { ok: true };
}

/** Whether `now` is still inside the clawback window from the first payment. */
export function isWithinClawbackWindow(
  firstPaidAt: Date | null,
  now: Date,
  clawbackDays: number,
): boolean {
  if (!firstPaidAt) return false;
  const ms = clawbackDays * 24 * 60 * 60 * 1000;
  return now.getTime() - firstPaidAt.getTime() <= ms;
}

/** Track-1 credit value (centavos): N months of the referred plan's price. */
export function track1CreditAmount(
  planMonthlyCentavos: number,
  creditMonths: number,
): number {
  return Math.max(0, Math.round(planMonthlyCentavos)) * Math.max(0, Math.floor(creditMonths));
}

/**
 * Whether the FIRST reward should accrue for a referral, given the invoice that
 * was just paid. Reward only on the first paid full month, exactly once.
 */
export function shouldAccrueFirstReward(referral: {
  status: string;
  firstPaidAt: Date | null;
}): boolean {
  // Already rewarded (firstPaidAt set) → idempotent no-op on webhook retries.
  return referral.firstPaidAt == null && referral.status !== "churned";
}

/** Whether a pending credit covers a full billing cycle (free month). */
export function creditCoversCycle(creditAmount: number, cycleAmount: number): boolean {
  return creditAmount >= cycleAmount && cycleAmount > 0;
}

// ----------------------------------------------------------------- Track 2

export type PartnerTier = "affiliate" | "reseller";
export type PayoutModel = "recurring" | "bounty";

export interface CommissionInput {
  payoutModel: PayoutModel;
  /** Count of PAID months so far for the referred restaurant (incl. this one). */
  paidMonthCount: number;
  invoiceAmount: number; // centavos, the paid invoice
  year1Pct: number; // e.g. 30 — months 1..year1Months
  ongoingPct: number; // e.g. 10 — every month after, for life
  year1Months: number; // e.g. 12 — the first-year boundary
  bountyAmount: number; // centavos (bounty model)
  /** Whether a bounty was already granted for this referral (idempotency). */
  bountyAlreadyGranted: boolean;
}

/**
 * The commission (centavos) a partner earns from a paid invoice, or null if
 * none applies.
 *
 * Recurring (FINAL terms): `year1Pct` of each paid month for the first
 * `year1Months` months, then `ongoingPct` every month after — for the LIFETIME
 * of the subscription (no upper bound). Flat rate for all partners (the old
 * affiliate/reseller split is superseded).
 *
 * Bounty: a one-time amount once the referral reaches its 2nd paid month.
 */
export function commissionForInvoice(i: CommissionInput): number | null {
  if (i.payoutModel === "bounty") {
    if (i.bountyAlreadyGranted) return null;
    if (i.paidMonthCount < 2) return null;
    return i.bountyAmount > 0 ? i.bountyAmount : null;
  }
  // recurring — two-tier, lifetime
  if (i.paidMonthCount < 1) return null;
  const pct = i.paidMonthCount <= i.year1Months ? i.year1Pct : i.ongoingPct;
  const amount = Math.round((Math.max(0, i.invoiceAmount) * Math.max(0, pct)) / 100);
  return amount > 0 ? amount : null;
}

// ----------------------------------------------------- Milestone bonuses (T2)

export interface BonusTierDef {
  /** Active paying referrals needed to unlock this one-time bonus. */
  activeReferrals: number;
  /** Bonus amount in CENTAVOS. */
  amount: number;
}

/**
 * Which milestone tiers are NEWLY earned, given the partner's current count of
 * ACTIVE paying referrals and the tiers already earned (by their activeReferrals
 * key). Bonuses stack (every crossed-and-unearned tier) and are earned ONCE —
 * passing the already-earned keys makes this idempotent and means a later drop
 * in active count never re-awards or claws back a bonus.
 */
export function newlyEarnedBonusTiers(
  activeCount: number,
  alreadyEarnedKeys: number[],
  tiers: BonusTierDef[],
): BonusTierDef[] {
  const earned = new Set(alreadyEarnedKeys);
  return tiers.filter((t) => activeCount >= t.activeReferrals && !earned.has(t.activeReferrals));
}

/** The "YYYY-MM" period bucket for a date (used for commissions/payouts). */
export function periodKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
