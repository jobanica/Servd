import type { DinerCategory } from "@/lib/cart/types";

/** Stable id for the section, so the menu's category button can link to it. */
export const AVAILABLE_SOON_ID = "available-soon";

const LABEL: Record<string, string> = {
  en: "🔜 Available soon",
  fil: "🔜 Malapit na",
};

export function availableSoonLabel(locale: string): string {
  return LABEL[locale] ?? LABEL.en;
}

/**
 * Move every "Available soon" item out of its category into one section at
 * the end of the menu — which the diner menus render as its own category
 * button. Pure.
 *
 * The items are shown, never orderable: `isAvailable` is forced false, so
 * every add button is already disabled, and `comingSoon` lets the card say
 * "Available soon" instead of "Sold out". A category left empty only because
 * its items are coming soon is dropped rather than shown as a blank heading;
 * one that was empty to begin with is left as it was.
 */
export function withAvailableSoon(categories: DinerCategory[], locale = "en"): DinerCategory[] {
  const soon = categories.flatMap((c) =>
    c.items.filter((i) => i.comingSoon).map((i) => ({ ...i, isAvailable: false })),
  );
  if (soon.length === 0) return categories;

  const rest = categories
    .map((c) => ({ ...c, items: c.items.filter((i) => !i.comingSoon) }))
    .filter((c, idx) => c.items.length > 0 || categories[idx].items.length === 0);

  return [...rest, { id: AVAILABLE_SOON_ID, name: availableSoonLabel(locale), items: soon }];
}
