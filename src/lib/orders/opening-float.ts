/**
 * The revolving fund a cashier counts into the drawer when opening a shift.
 *
 * Pure, because this number is the baseline every later count is checked
 * against: get it wrong at 6am and the variance at closing is wrong all day,
 * and the cashier is the one who has to explain it.
 */

/** Nobody starts a till with more than this; a bigger number is a typo. */
export const MAX_OPENING_FLOAT_PESOS = 100_000;

/**
 * Is this a sane opening fund? Returns a message to show, or null.
 *
 * Blank is rejected rather than read as zero. A cashier who starts with an
 * empty drawer should say so by typing 0 — the difference between "nothing in
 * it" and "I skipped the question" is the whole point of asking.
 */
export function validateOpeningFloat(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return "Enter what's in the drawer. Type 0 if it's empty.";
  const n = Number(s);
  if (!Number.isFinite(n)) return "Enter an amount in pesos.";
  if (n < 0) return "The opening fund can't be negative.";
  if (n > MAX_OPENING_FLOAT_PESOS) {
    return `That looks like a typo — the most you can open with is ₱${MAX_OPENING_FLOAT_PESOS.toLocaleString()}.`;
  }
  return null;
}

/**
 * How a shift's fund reads on screen.
 *
 * Null is NOT zero: it means the shift was opened before anyone was asked, or
 * by a payment arriving on its own. Printing "₱0.00" for that would assert the
 * drawer started empty and hand someone a variance they cannot explain.
 */
export function floatLabel(openingFloat: number | null, peso: (c: number) => string): string {
  return openingFloat == null ? "not counted" : peso(openingFloat);
}
