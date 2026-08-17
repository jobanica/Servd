/**
 * Everything a restaurant can change about what its printers and its kitchen
 * screen put in front of somebody.
 *
 * All of it lives in the `printerConfig` JSON column, which already exists on
 * every database — deliberately, and not as a shortcut. Each of these settings
 * would otherwise be one more column that has to be added by hand before the
 * feature works, and a shop waiting on a migration is a shop where the rider
 * still has no address on the docket. A JSON blob has no migration lag.
 *
 * Pure: parsing and defaults live here, reading and writing live in the server.
 */

export type DrawerPolicyRaw = string | null | undefined;

export interface ReceiptOptions {
  address: string | null;
  phone: string | null;
  website: string | null;
  footer: string | null;
  /** Print the "VAT (12% incl.)" line. */
  showVat: boolean;
  /**
   * Print who the order is for — name, delivery address, contact number.
   *
   * On by default for the reason it was asked for: the rider is holding the
   * docket and shouldn't have to go back to Facebook to find out where they're
   * going, or to the app to get a number to ring when they're outside.
   */
  showCustomer: boolean;
  /** On a cash sale, print what was handed over and the change given back. */
  showCashTendered: boolean;
}

export interface KitchenOptions {
  /**
   * Show the delivery address on kitchen tickets.
   *
   * Off by default — most kitchens don't want it, and it's a customer's home
   * address on a screen the whole line can see. On, it lets a kitchen working
   * by zone group everything going the same way into one run, which is the
   * whole reason it was asked for.
   */
  showAddress: boolean;
}

export interface PaymentOptions {
  /**
   * Lead with "Take payment" at the till instead of "Send to kitchen".
   *
   * Off by default — it changes the shape of every order a cashier rings up,
   * and that shouldn't arrive unannounced in an app update. On, it only moves
   * which button is the big one; the cashier can still send an order unpaid.
   */
  payFirst: boolean;
  /**
   * Card surcharge, in basis points (350 = 3.50%). Zero means no surcharge.
   *
   * Basis points rather than a float so the stored value is exact — a
   * percentage that has to survive a JSON round-trip and then multiply money
   * is not a place for 0.035.
   */
  cardSurchargeBp: number;
}

export interface PrinterConfig {
  bridgeUrl: string | null;
  pollToken: string | null;
  configured: boolean;
  receipt: ReceiptOptions;
  kitchen: KitchenOptions;
  payments: PaymentOptions;
}

/** A surcharge above this is far more likely to be a typo than a policy. */
export const MAX_SURCHARGE_BP = 2000; // 20%
export const DEFAULT_CARD_SURCHARGE_BP = 350; // 3.5%, the rate that was asked for

function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

/** Missing means "the old behaviour", which for every one of these is `on`. */
function boolOn(v: unknown): boolean {
  return v !== false;
}

function boolOff(v: unknown): boolean {
  return v === true;
}

/** Clamp to a whole, sane number of basis points. */
export function normalizeSurchargeBp(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_SURCHARGE_BP, Math.round(n));
}

/** Percent as typed by a human ("3.5") → basis points (350). */
export function percentToBp(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return normalizeSurchargeBp(n * 100);
}

/** Basis points → the shortest exact percent string ("350" → "3.5"). */
export function bpToPercentString(bp: number): string {
  if (bp <= 0) return "";
  return String(Math.round(bp) / 100);
}

/**
 * Read the blob. Every field falls back to the behaviour that was in place
 * before the field existed, so a restaurant that has never opened the settings
 * page sees no change at all.
 */
export function parsePrinterConfig(raw: unknown): PrinterConfig {
  const cfg = (raw ?? {}) as Record<string, unknown>;
  const receipt = (cfg.receipt ?? {}) as Record<string, unknown>;
  const kitchen = (cfg.kitchen ?? {}) as Record<string, unknown>;
  const payments = (cfg.payments ?? {}) as Record<string, unknown>;

  return {
    bridgeUrl: str(cfg.bridgeUrl),
    pollToken: str(cfg.pollToken),
    configured: cfg.configured === true,
    receipt: {
      address: str(receipt.address),
      phone: str(receipt.phone),
      website: str(receipt.website),
      footer: str(receipt.footer),
      showVat: boolOn(receipt.showVat),
      showCustomer: boolOn(receipt.showCustomer),
      showCashTendered: boolOn(receipt.showCashTendered),
    },
    kitchen: { showAddress: boolOff(kitchen.showAddress) },
    payments: {
      payFirst: boolOff(payments.payFirst),
      cardSurchargeBp: normalizeSurchargeBp(payments.cardSurchargeBp),
    },
  };
}
