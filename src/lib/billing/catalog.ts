/**
 * The canonical plan catalog — one source of truth for what each tier costs and
 * which features it includes. Drives the public pricing page AND the in-app
 * billing comparison so they can never drift apart.
 *
 * Tiers ascend: Free (run service, no monthly fee) → Growth (your brand online +
 * marketing + AI menu import, adds a custom domain) → Business (the complete
 * suite — every feature). Pure data, safe to import in both server and client
 * components.
 */

export const TIERS = ["Free", "Growth", "Business"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierInfo {
  name: Tier;
  pricePesos: number;
  tagline: string;
  highlights: string[];
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  Free: {
    name: "Free",
    pricePesos: 0,
    tagline: "Everything to take orders and run service — free forever.",
    highlights: [
      "Up to 5 tables",
      "QR dine-in ordering",
      "Kitchen display & cashier POS",
      "Cash & card at the counter",
      "Feedback & Google reviews",
    ],
  },
  Growth: {
    name: "Growth",
    pricePesos: 899,
    tagline: "Your brand online — ordering, payments & marketing.",
    highlights: [
      "Up to 20 tables",
      "Everything in Free, plus:",
      "Your own custom domain",
      "Online ordering, pickup & delivery",
      "Online payments (GCash / card)",
      "Loyalty, promotions, customers & SMS",
      "AI menu import",
    ],
  },
  Business: {
    name: "Business",
    pricePesos: 1799,
    tagline: "The complete suite — every feature included.",
    highlights: [
      "Unlimited tables & staff",
      "Everything in Growth, plus:",
      "Accounting (sales, VAT, P&L)",
      "Inventory + food COGS",
      "HR, attendance & payroll",
      "1,000 SMS credits / month",
    ],
  },
};

/** The tier we visually highlight as the best value. */
export const POPULAR_TIER: Tier = "Growth";

/** A feature cell: included (true), not included (false), or a value label. */
export type Cell = boolean | string;

export interface FeatureRow {
  label: string;
  Free: Cell;
  Growth: Cell;
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
      { label: "QR dine-in ordering", Free: true, Growth: true, Business: true },
      { label: "Cashier POS", Free: true, Growth: true, Business: true },
      { label: "Real-time kitchen display", Free: true, Growth: true, Business: true },
      { label: "Online ordering website", Free: false, Growth: true, Business: true },
      { label: "Pickup & delivery orders", Free: false, Growth: true, Business: true },
      { label: "Tables included", Free: "5", Growth: "20", Business: "Unlimited" },
      { label: "Staff accounts", Free: "3", Growth: "15", Business: "Unlimited" },
    ],
  },
  {
    group: "Payments",
    rows: [
      { label: "Cash & card at the counter", Free: true, Growth: true, Business: true },
      { label: "Online payment (GCash / card)", Free: false, Growth: true, Business: true },
      { label: "Auto-printed receipts with QR", Free: true, Growth: true, Business: true },
    ],
  },
  {
    group: "Marketing & growth",
    rows: [
      { label: "Feedback & Google reviews", Free: true, Growth: true, Business: true },
      { label: "Loyalty & rewards", Free: false, Growth: true, Business: true },
      { label: "Promotions", Free: false, Growth: true, Business: true },
      { label: "Customer book + CSV export", Free: false, Growth: true, Business: true },
      { label: "AI menu import", Free: false, Growth: true, Business: true },
      { label: "SMS marketing credits", Free: "—", Growth: "200 / mo", Business: "1,000 / mo" },
    ],
  },
  {
    group: "Back office",
    rows: [
      { label: "Analytics & reports", Free: true, Growth: true, Business: true },
      { label: "Accounting (sales, VAT, P&L)", Free: false, Growth: false, Business: true },
      { label: "Inventory + food COGS", Free: false, Growth: false, Business: true },
      { label: "HR, attendance & payroll", Free: false, Growth: false, Business: true },
    ],
  },
  {
    group: "Branding",
    rows: [
      { label: "Custom logo & colors", Free: true, Growth: true, Business: true },
      { label: "Custom domain", Free: false, Growth: true, Business: true },
    ],
  },
];

/** Whether a feature cell counts as "included" (for card check-lists). */
export function isIncluded(cell: Cell): boolean {
  return cell === true || (typeof cell === "string" && cell !== "—");
}
