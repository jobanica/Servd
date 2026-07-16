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
    tagline: "Everything to take orders and run service — free for life.",
    highlights: [
      "1 dine-in table QR & 3 staff",
      "QR dine-in + counter/takeout order numbers",
      "Online ordering website — pickup & delivery",
      "Kitchen display & cashier POS",
      "Split payments, split bills & tips",
      "Void / edit with manager approval",
      "Dietary tags, feedback & Google reviews",
    ],
  },
  Growth: {
    name: "Growth",
    pricePesos: 899,
    tagline: "Your brand online — ordering, payments & marketing.",
    highlights: [
      "Up to 20 tables & 15 staff",
      "Everything in Free, plus:",
      "Your own custom domain",
      "Online payments (GCash / card)",
      "Floor plan, reservations & gift cards",
      "Loyalty, promotions & happy hours",
      "Cart recovery, AI menu import, SMS & exports",
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
      "Inventory, food COGS & auto-reorder",
      "HR, attendance & payroll",
      "Offline mode + audit log",
      "Full white-label (remove Servd branding)",
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
      { label: "Counter / takeout order numbers", Free: true, Growth: true, Business: true },
      { label: "Cashier POS", Free: true, Growth: true, Business: true },
      { label: "Real-time kitchen display", Free: true, Growth: true, Business: true },
      { label: "Print kitchen tickets or use a screen", Free: true, Growth: true, Business: true },
      { label: "Dietary tags & allergen labels", Free: true, Growth: true, Business: true },
      { label: "Order void / edit with manager approval", Free: true, Growth: true, Business: true },
      { label: "Visual floor plan & live table status", Free: false, Growth: true, Business: true },
      { label: "Reservations & waitlist", Free: false, Growth: true, Business: true },
      { label: "Online ordering website", Free: true, Growth: true, Business: true },
      { label: "Pickup & delivery orders", Free: true, Growth: true, Business: true },
      { label: "Tables included", Free: "1", Growth: "20", Business: "Unlimited" },
      { label: "Staff accounts", Free: "3", Growth: "15", Business: "Unlimited" },
    ],
  },
  {
    group: "Payments",
    rows: [
      { label: "Cash & card at the counter", Free: true, Growth: true, Business: true },
      { label: "Split payment & split bill", Free: true, Growth: true, Business: true },
      { label: "Tips & gratuity", Free: true, Growth: true, Business: true },
      { label: "Auto-printed receipts with QR", Free: true, Growth: true, Business: true },
      { label: "Online payment (GCash / card)", Free: false, Growth: true, Business: true },
      { label: "Gift cards & store credit", Free: false, Growth: true, Business: true },
    ],
  },
  {
    group: "Marketing & growth",
    rows: [
      { label: "Feedback & Google reviews", Free: true, Growth: true, Business: true },
      { label: "Loyalty & rewards", Free: false, Growth: true, Business: true },
      { label: "Promotions & promo codes", Free: false, Growth: true, Business: true },
      { label: "Happy-hour scheduled pricing", Free: false, Growth: true, Business: true },
      { label: "Abandoned-cart recovery", Free: false, Growth: true, Business: true },
      { label: "Customer book + CSV export", Free: false, Growth: true, Business: true },
      { label: "AI menu import", Free: false, Growth: true, Business: true },
      { label: "SMS marketing credits", Free: "—", Growth: "200 / mo", Business: "1,000 / mo" },
    ],
  },
  {
    group: "Operations & back office",
    rows: [
      { label: "Analytics & reports", Free: true, Growth: true, Business: true },
      { label: "AI-powered insights (Claude)", Free: false, Growth: true, Business: true },
      { label: "Shift handover notes", Free: true, Growth: true, Business: true },
      { label: "Staff performance reports", Free: true, Growth: true, Business: true },
      { label: "Data export (sales, orders, menu)", Free: false, Growth: true, Business: true },
      { label: "Audit log (who changed what)", Free: false, Growth: false, Business: true },
      { label: "Offline mode (keep taking orders)", Free: false, Growth: false, Business: true },
      { label: "Accounting (sales, VAT, P&L)", Free: false, Growth: false, Business: true },
      { label: "Inventory + food COGS", Free: false, Growth: false, Business: true },
      { label: "Low-stock alerts & auto-reorder", Free: false, Growth: false, Business: true },
      { label: "HR, attendance & payroll", Free: false, Growth: false, Business: true },
    ],
  },
  {
    group: "Branding",
    rows: [
      { label: "Custom logo & colors", Free: true, Growth: true, Business: true },
      { label: "Custom domain", Free: false, Growth: true, Business: true },
      { label: "Remove “Powered by Servd” (full white-label)", Free: false, Growth: false, Business: true },
    ],
  },
];

/** Whether a feature cell counts as "included" (for card check-lists). */
export function isIncluded(cell: Cell): boolean {
  return cell === true || (typeof cell === "string" && cell !== "—");
}
