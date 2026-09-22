/**
 * The packaging fee — what the customer pays for the tubs and containers a
 * to-go order is sent out in.
 *
 * Pure, and shared on purpose. The checkout page quotes this fee and the
 * server charges it; those two disagreeing is the worst way this can fail, and
 * they disagree the moment there are two copies of the arithmetic. There is
 * one copy, and both sides call it.
 *
 * The rule that makes it right: the fee is per CONTAINER, not per line on the
 * receipt. A bottled softdrink arrives in its own bottle, so it needs no tub
 * and is not charged for one.
 */

export interface PackagingConfig {
  packagingFeeEnabled: boolean;
  packagingFee: number; // centavos — per order, or per item (see mode)
  packagingFeeScope: "delivery" | "all";
  packagingFeeMode: "order" | "item";
}

/** Anything cart-shaped: a checkout line or a validated order item. */
export interface PackagedLine {
  itemId: string;
  quantity: number;
}

/**
 * How many units in this cart actually need packing.
 *
 * `exempt` holds the menu item ids the owner marked as needing no container.
 * Everything not in it is packed — an unmarked menu, or a database that hasn't
 * run the migration yet, therefore counts exactly as it did before this
 * existed.
 */
export function packagedUnits(
  lines: readonly PackagedLine[],
  exempt: ReadonlySet<string> = new Set(),
): number {
  return lines.reduce(
    (n, l) => (exempt.has(l.itemId) ? n : n + Math.max(0, Math.round(l.quantity) || 0)),
    0,
  );
}

/**
 * The packaging fee for an order, in centavos.
 *
 * `units` is the packed count from `packagedUnits` — not the cart count. Zero
 * means nothing in the order needs a container, and then there is no fee to
 * charge in EITHER mode: a flat "per order" fee on an order of three bottled
 * drinks is still a charge for packaging that was never used.
 */
export function computePackagingFee(
  cfg: PackagingConfig,
  orderType: "pickup" | "delivery",
  units: number,
): number {
  if (!cfg.packagingFeeEnabled || cfg.packagingFee <= 0) return 0;
  if (cfg.packagingFeeScope === "delivery" && orderType !== "delivery") return 0;
  const packed = Math.max(0, Math.round(units) || 0);
  if (packed === 0) return 0;
  return cfg.packagingFee * (cfg.packagingFeeMode === "item" ? packed : 1);
}
