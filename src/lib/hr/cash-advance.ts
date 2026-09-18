/**
 * Cash advance repaid a little each cutoff.
 *
 * All centavos, all integers. The one rule worth stating plainly: a deduction
 * can never exceed what is still owed. Get that wrong and the last cutoff takes
 * the full instalment off a ₱200 balance and the restaurant has quietly
 * over-collected from someone's wages — the single worst way this can fail.
 */

export type AdvanceStatus = "active" | "paused" | "settled" | "cancelled";

export interface Advance {
  principal: number;
  perPeriod: number;
  status: AdvanceStatus;
}

/** How much of the loan is still owed. Never negative. */
export function outstanding(principal: number, repaid: number): number {
  if (!Number.isFinite(principal) || !Number.isFinite(repaid)) return 0;
  return Math.max(0, Math.round(principal) - Math.round(repaid));
}

/** Has it been paid off? */
export function isFullyRepaid(principal: number, repaid: number): boolean {
  return outstanding(principal, repaid) === 0;
}

/**
 * What to take this cutoff.
 *
 * The instalment, capped at the remaining balance — so the final one collects
 * exactly what is left and not a peso more. Zero while paused, cancelled or
 * already settled, which is what makes "pause it this payday" a real option
 * rather than something the owner has to remember not to do.
 */
export function nextDeduction(advance: Advance, repaid: number): number {
  if (advance.status !== "active") return 0;
  const left = outstanding(advance.principal, repaid);
  if (left === 0) return 0;
  const per = Math.max(0, Math.round(advance.perPeriod));
  if (per === 0) return 0;
  return Math.min(per, left);
}

/**
 * How many more cutoffs at this rate, including a short final one.
 *
 * Shown to the owner when they set the advance up, because "₱500 a cutoff"
 * means very little until you hear "that's ten paydays".
 */
export function periodsRemaining(advance: Advance, repaid: number): number | null {
  const left = outstanding(advance.principal, repaid);
  if (left === 0) return 0;
  const per = Math.max(0, Math.round(advance.perPeriod));
  if (per === 0) return null; // never finishes; not a number worth inventing
  return Math.ceil(left / per);
}

/** Progress for a bar, 0–100. */
export function percentRepaid(principal: number, repaid: number): number {
  const p = Math.round(principal);
  if (p <= 0) return 100;
  const done = Math.min(p, Math.max(0, Math.round(repaid)));
  return Math.round((done / p) * 100);
}

/**
 * Is this a sane advance to record?
 *
 * Deliberately strict about the instalment exceeding the principal: it is
 * almost always a typo (₱5,000 a cutoff on a ₱5,000 loan), and the cap would
 * hide it by silently making it a one-off.
 */
export function validateAdvance(principalPesos: number, perPeriodPesos: number): string | null {
  if (!Number.isFinite(principalPesos) || principalPesos <= 0) {
    return "Enter the advance amount.";
  }
  if (!Number.isFinite(perPeriodPesos) || perPeriodPesos <= 0) {
    return "Enter how much to deduct each payday.";
  }
  if (perPeriodPesos > principalPesos) {
    return "The per-payday amount is more than the advance itself.";
  }
  return null;
}
