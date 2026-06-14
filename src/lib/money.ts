/**
 * MONEY HANDLING
 *
 * We store all money as INTEGER centavos in the database (see schema comments)
 * to avoid floating-point rounding errors on prices and totals. The UI works in
 * pesos, so convert at the boundary.
 *
 *   ₱250.00  <->  25000 centavos
 */

/** Parse a peso string/number from a form into integer centavos. */
export function pesosToCentavos(input: string | number): number {
  const pesos = typeof input === "number" ? input : parseFloat(input);
  if (Number.isNaN(pesos)) throw new Error("Invalid amount");
  return Math.round(pesos * 100);
}

/** Centavos -> a number of pesos (for form default values). */
export function centavosToPesos(centavos: number): number {
  return centavos / 100;
}

/** Format centavos as a display string, e.g. 25000 -> "₱250.00". */
export function formatPeso(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sign}₱${(abs / 100).toFixed(2)}`;
}

/** Format a modifier price delta, e.g. 3000 -> "+₱30.00", 0 -> "". */
export function formatDelta(centavos: number): string {
  if (centavos === 0) return "";
  return centavos > 0 ? `+${formatPeso(centavos)}` : formatPeso(centavos);
}
