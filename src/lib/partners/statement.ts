/**
 * Payout-statement math (pure, testable). Withholding is CONFIGURABLE and is not
 * tax advice — the rate comes from program_settings and an accountant should
 * confirm the correct PH treatment. All amounts in centavos.
 */

/** Withholding tax amount for a gross payout at a given percentage. */
export function withholdingAmount(grossCentavos: number, pct: number): number {
  const gross = Math.max(0, Math.round(grossCentavos));
  const p = Math.min(100, Math.max(0, pct));
  return Math.round((gross * p) / 100);
}

/** Net payable = gross − withholding (never negative). */
export function netPayout(grossCentavos: number, pct: number): number {
  return Math.max(0, Math.max(0, Math.round(grossCentavos)) - withholdingAmount(grossCentavos, pct));
}
