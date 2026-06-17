/**
 * The canonical plan catalog — one source of truth for what each tier costs and
 * which features it includes. Drives the public pricing page AND the in-app
 * billing comparison so they can never drift apart.
 *
 * Tiers ascend: Starter (essentials) → Pro (your brand online + marketing,
 * adds a custom domain) → Business (the complete suite — every feature). Pure
 * data, safe to import in both server and client components.
 */

export const TIERS = ["Starter", "Pro", "Business"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierInfo {
  name: Tier;
  pricePesos: number;
  tagline: string;
  highlights: string[];
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  Starter: {
    name: "Starter",
    pricePesos: 1999,
    tagline: "Everything to take orders and run service.",
    highlights: [
      "Up to 10 tables",
      "QR dine-in ordering",
      "Kitchen display & cashier POS",
      "Cash & card payments",
      "Feedback & Google reviews",
    ],
  },
  Pro: {
    name: "Pro",
    pricePesos: 2999,
    tagline: "Your brand online — domain, ordering & marketing.",
    highlights: [
      "Up to 30 tables",
      "Everything in Starter, plus:",
      "Your own custom domain",
      "Online ordering, pickup & delivery",
      "Online payments (GCash / card)",
      "Loyalty, promotions, customers & SMS",
    ],
  },
  Business: {
    name: "Business",
    pricePesos: 4999,
    tagline: "The complete suite — every feature included.",
    highlights: [
      "Unlimited tables & staff",
      "Everything in Pro, plus:",
      "Accounting (sales, VAT, P&L)",
      "Inventory + food COGS",
      "HR, attendance & payroll",
      "1,000 SMS credits / month",
    ],
  },
};

/** The tier we visually highlight as the best value. */
export const POPULAR_TIER: Tier = "Pro";

/** A feature cell: included (true), not included (false), or a value label. */
export type Cell = boolean | string;

export interface FeatureRow {
  label: string;
  Starter: Cell;
  Pro: Cell;
  Business: Cell;
}

export interface FeatureGroup {
  group: string;
  rows: FeatureRow[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    group: "Ordering & service",
    rows: [
      { label: "QR dine-in ordering", Starter: true, Pro: true, Business: true },
      { label: "Cashier POS", Starter: true, Pro: true, Business: true },
      { label: "Real-time kitchen display", Starter: true, Pro: true, Business: true },
      { label: "Online ordering website", Starter: false, Pro: true, Business: true },
      { label: "Pickup & delivery orders", Starter: false, Pro: true, Business: true },
      { label: "Tables included", Starter: "10", Pro: "30", Business: "Unlimited" },
      { label: "Staff accounts", Starter: "5", Pro: "20", Business: "Unlimited" },
    ],
  },
  {
    group: "Payments",
    rows: [
      { label: "Cash & card at the counter", Starter: true, Pro: true, Business: true },
      { label: "Online payment (GCash / card)", Starter: false, Pro: true, Business: true },
      { label: "Auto-printed receipts with QR", Starter: true, Pro: true, Business: true },
    ],
  },
  {
    group: "Marketing & growth",
    rows: [
      { label: "Feedback & Google reviews", Starter: true, Pro: true, Business: true },
      { label: "Loyalty & rewards", Starter: false, Pro: true, Business: true },
      { label: "Promotions", Starter: false, Pro: true, Business: true },
      { label: "Customer book + CSV export", Starter: false, Pro: true, Business: true },
      { label: "SMS marketing credits", Starter: "—", Pro: "200 / mo", Business: "1,000 / mo" },
    ],
  },
  {
    group: "Back office",
    rows: [
      { label: "Analytics & reports", Starter: true, Pro: true, Business: true },
      { label: "Accounting (sales, VAT, P&L)", Starter: false, Pro: false, Business: true },
      { label: "Inventory + food COGS", Starter: false, Pro: false, Business: true },
      { label: "HR, attendance & payroll", Starter: false, Pro: false, Business: true },
    ],
  },
  {
    group: "Branding",
    rows: [
      { label: "Custom logo & colors", Starter: true, Pro: true, Business: true },
      { label: "Custom domain", Starter: false, Pro: true, Business: true },
    ],
  },
];

/** Whether a feature cell counts as "included" (for card check-lists). */
export function isIncluded(cell: Cell): boolean {
  return cell === true || (typeof cell === "string" && cell !== "—");
}
