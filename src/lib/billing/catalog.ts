/**
 * The canonical plan catalog — one source of truth for what each tier costs and
 * which features it includes. Drives the public pricing page AND the in-app
 * billing comparison so they can never drift apart.
 *
 * Tiers ascend: Starter (essentials) → Business (every feature) → Pro
 * (everything in Business plus a custom domain). Pure data, safe to import in
 * both server and client components.
 */

export const TIERS = ["Starter", "Business", "Pro"] as const;
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
  Business: {
    name: "Business",
    pricePesos: 2999,
    tagline: "Every feature to grow — the full toolkit.",
    highlights: [
      "Up to 30 tables",
      "Everything in Starter, plus:",
      "Online ordering, pickup & delivery",
      "Online payments (GCash / card)",
      "Loyalty, promotions, customers & SMS",
      "Accounting, inventory & HR / payroll",
    ],
  },
  Pro: {
    name: "Pro",
    pricePesos: 4999,
    tagline: "Everything in Business, plus your own domain.",
    highlights: [
      "Unlimited tables & staff",
      "Everything in Business, plus:",
      "Your own custom domain",
      "1,000 SMS credits / month",
      "Priority support",
    ],
  },
};

/** The tier we visually highlight as the best value. */
export const POPULAR_TIER: Tier = "Business";

/** A feature cell: included (true), not included (false), or a value label. */
export type Cell = boolean | string;

export interface FeatureRow {
  label: string;
  Starter: Cell;
  Business: Cell;
  Pro: Cell;
}

export interface FeatureGroup {
  group: string;
  rows: FeatureRow[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    group: "Ordering & service",
    rows: [
      { label: "QR dine-in ordering", Starter: true, Business: true, Pro: true },
      { label: "Cashier POS", Starter: true, Business: true, Pro: true },
      { label: "Real-time kitchen display", Starter: true, Business: true, Pro: true },
      { label: "Online ordering website", Starter: false, Business: true, Pro: true },
      { label: "Pickup & delivery orders", Starter: false, Business: true, Pro: true },
      { label: "Tables included", Starter: "10", Business: "30", Pro: "Unlimited" },
      { label: "Staff accounts", Starter: "5", Business: "20", Pro: "Unlimited" },
    ],
  },
  {
    group: "Payments",
    rows: [
      { label: "Cash & card at the counter", Starter: true, Business: true, Pro: true },
      { label: "Online payment (GCash / card)", Starter: false, Business: true, Pro: true },
      { label: "Auto-printed receipts with QR", Starter: true, Business: true, Pro: true },
    ],
  },
  {
    group: "Marketing & growth",
    rows: [
      { label: "Feedback & Google reviews", Starter: true, Business: true, Pro: true },
      { label: "Loyalty & rewards", Starter: false, Business: true, Pro: true },
      { label: "Promotions", Starter: false, Business: true, Pro: true },
      { label: "Customer book + CSV export", Starter: false, Business: true, Pro: true },
      { label: "SMS marketing credits", Starter: "—", Business: "200 / mo", Pro: "1,000 / mo" },
    ],
  },
  {
    group: "Back office",
    rows: [
      { label: "Analytics & reports", Starter: true, Business: true, Pro: true },
      { label: "Accounting (sales, VAT, P&L)", Starter: false, Business: true, Pro: true },
      { label: "Inventory + food COGS", Starter: false, Business: true, Pro: true },
      { label: "HR, attendance & payroll", Starter: false, Business: true, Pro: true },
    ],
  },
  {
    group: "Branding",
    rows: [
      { label: "Custom logo & colors", Starter: true, Business: true, Pro: true },
      { label: "Custom domain", Starter: false, Business: false, Pro: true },
    ],
  },
];

/** Whether a feature cell counts as "included" (for card check-lists). */
export function isIncluded(cell: Cell): boolean {
  return cell === true || (typeof cell === "string" && cell !== "—");
}
