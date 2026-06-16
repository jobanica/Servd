import { formatPeso } from "@/lib/money";

/**
 * Order-level discounts applied at the cashier (e.g. PH Senior Citizen / PWD
 * 20%, or a custom amount). Pure + tiny so it's the single source of truth for
 * how a discount turns into centavos off the gross total.
 */
export type DiscountKind = "none" | "senior" | "pwd" | "percent" | "amount";

export interface ComputedDiscount {
  amount: number; // centavos off the gross total
  label: string | null; // human-readable, shown on receipt + diner app
}

/** Compute the discount in centavos for a given gross total (centavos). */
export function computeDiscount(
  total: number,
  kind: DiscountKind,
  value?: number,
): ComputedDiscount {
  switch (kind) {
    case "senior":
      return { amount: Math.round(total * 0.2), label: "Senior Citizen (20%)" };
    case "pwd":
      return { amount: Math.round(total * 0.2), label: "PWD (20%)" };
    case "percent": {
      const pct = Math.max(0, Math.min(100, Math.round(value ?? 0)));
      if (pct <= 0) return { amount: 0, label: null };
      return { amount: Math.min(total, Math.round((total * pct) / 100)), label: `${pct}% off` };
    }
    case "amount": {
      const amt = Math.max(0, Math.min(total, Math.round((value ?? 0) * 100)));
      if (amt <= 0) return { amount: 0, label: null };
      return { amount: amt, label: `${formatPeso(amt)} off` };
    }
    default:
      return { amount: 0, label: null };
  }
}

/** Net payable after discount (never below zero). */
export function netTotal(total: number, discountAmount: number): number {
  return Math.max(0, total - discountAmount);
}
