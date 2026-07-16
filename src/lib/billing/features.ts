import { TIERS, type Tier } from "@/lib/billing/catalog";

/**
 * The canonical list of GATEABLE features. These are the toggles the super-admin
 * flips per plan; a restaurant's entitlements are resolved live from whichever
 * features its plan has enabled (see server/billing/feature-gate.ts).
 *
 * Pure data — safe to import in client components (the super-admin plan editor)
 * and on the server. Core capabilities that every plan always includes (QR
 * dine-in, cashier POS, kitchen display, counter ordering, split/tip, void-edit,
 * dietary tags, feedback, shift notes…) are intentionally NOT in this list:
 * they're never gated, so there's nothing to toggle.
 */
export type Feature =
  | "onlineOrdering"
  | "onlinePayments"
  | "loyalty"
  | "promotions"
  | "customers"
  | "sms"
  | "aiMenuImport"
  | "floorPlan"
  | "giftCards"
  | "reservations"
  | "dataExport"
  | "auditLog"
  | "offline"
  | "accounting"
  | "inventory"
  | "hr"
  | "customDomain"
  | "whiteLabel";

export interface FeatureMeta {
  key: Feature;
  label: string;
  group: string;
}

/** Display metadata, grouped — drives the super-admin per-plan checkboxes. */
export const FEATURE_META: FeatureMeta[] = [
  { key: "floorPlan", label: "Visual floor plan & table status", group: "Ordering & service" },
  { key: "reservations", label: "Reservations & waitlist", group: "Ordering & service" },
  { key: "onlineOrdering", label: "Online ordering website + delivery", group: "Ordering & service" },
  { key: "onlinePayments", label: "Online payments (GCash / card)", group: "Payments" },
  { key: "giftCards", label: "Gift cards & store credit", group: "Payments" },
  { key: "loyalty", label: "Loyalty & rewards", group: "Marketing & growth" },
  { key: "promotions", label: "Promotions, promo codes & happy hours", group: "Marketing & growth" },
  { key: "customers", label: "Customer book + CSV export", group: "Marketing & growth" },
  { key: "sms", label: "SMS marketing", group: "Marketing & growth" },
  { key: "aiMenuImport", label: "AI menu import", group: "Marketing & growth" },
  { key: "dataExport", label: "Data export (sales, orders, menu)", group: "Operations & back office" },
  { key: "auditLog", label: "Audit log (who changed what)", group: "Operations & back office" },
  { key: "offline", label: "Offline mode (keep taking orders)", group: "Operations & back office" },
  { key: "accounting", label: "Accounting (sales, VAT, P&L)", group: "Operations & back office" },
  { key: "inventory", label: "Inventory, COGS, low-stock & reorder", group: "Operations & back office" },
  { key: "hr", label: "HR, attendance & payroll", group: "Operations & back office" },
  { key: "customDomain", label: "Custom domain", group: "Branding" },
  { key: "whiteLabel", label: "Full white-label (remove “Powered by Servd”)", group: "Branding" },
];

export const ALL_FEATURES: Feature[] = FEATURE_META.map((f) => f.key);

const FEATURE_SET = new Set<string>(ALL_FEATURES);

/** Type-guard: is an arbitrary string one of our known features? */
export function isFeature(x: string): x is Feature {
  return FEATURE_SET.has(x);
}

/** Drop unknown keys (e.g. a feature retired since the row was written). */
export function sanitizeFeatures(list: readonly string[]): Feature[] {
  return ALL_FEATURES.filter((f) => list.includes(f));
}

/**
 * Default feature→tier mapping. This seeds new plans and is the FALLBACK when a
 * plan's features haven't been configured yet (e.g. before the migration runs).
 * Once a plan is saved from the editor, its stored features are authoritative.
 */
export const FEATURE_TIERS: Record<Feature, Tier[]> = {
  onlineOrdering: ["Free", "Growth", "Business"],
  onlinePayments: ["Growth", "Business"],
  loyalty: ["Growth", "Business"],
  promotions: ["Growth", "Business"],
  customers: ["Growth", "Business"],
  sms: ["Growth", "Business"],
  aiMenuImport: ["Growth", "Business"],
  floorPlan: ["Growth", "Business"],
  giftCards: ["Growth", "Business"],
  reservations: ["Growth", "Business"],
  dataExport: ["Growth", "Business"],
  customDomain: ["Growth", "Business"],
  auditLog: ["Business"],
  offline: ["Business"],
  accounting: ["Business"],
  inventory: ["Business"],
  hr: ["Business"],
  whiteLabel: ["Business"],
};

/** Map a plan name to a known tier, if it is one. */
export function asTier(name: string | null | undefined): Tier | null {
  return name && (TIERS as readonly string[]).includes(name) ? (name as Tier) : null;
}

/** The default feature set for a tier (used to seed/fallback). */
export function defaultFeaturesForTier(tier: Tier | null): Feature[] {
  if (!tier) return [];
  return ALL_FEATURES.filter((f) => FEATURE_TIERS[f].includes(tier));
}
