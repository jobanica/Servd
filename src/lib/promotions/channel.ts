import { formatPeso } from "@/lib/money";
import { offerSummary } from "@/lib/promotions/compute";

/**
 * Where a promotion can be used. Stored on the promotion as `channel`:
 * null (everywhere), "online" or "dine_in".
 *
 *  online  — the ordering website: delivery and pickup orders.
 *  dine_in — in the restaurant: the table QR menu and the bill.
 */
export type PromoWhere = "online" | "dine_in";
export type PromoChannel = PromoWhere | null;

export const PROMO_CHANNEL_OPTIONS: { value: "" | PromoWhere; label: string }[] = [
  { value: "", label: "Everywhere (online & dine-in)" },
  { value: "online", label: "Online orders only (delivery & pickup)" },
  { value: "dine_in", label: "Dine-in only (in the restaurant)" },
];

/** Form/stored value → a channel, unknown values meaning everywhere. */
export function normalizePromoChannel(raw: unknown): PromoChannel {
  return raw === "online" || raw === "dine_in" ? raw : null;
}

export function promoAppliesTo(channel: string | null | undefined, where: PromoWhere): boolean {
  const c = normalizePromoChannel(channel);
  return c === null || c === where;
}

/** The sentence a customer sees when a code is used in the wrong place. */
export function wrongChannelMessage(channel: string | null | undefined): string {
  return normalizePromoChannel(channel) === "online"
    ? "This code is for online orders only (delivery & pickup)."
    : "This code is for dine-in only — use it at the restaurant.";
}

export function channelBadge(channel: string | null | undefined): string | null {
  const c = normalizePromoChannel(channel);
  return c === "online" ? "🛵 Online only" : c === "dine_in" ? "🍽️ Dine-in only" : null;
}

export interface PromoForMechanics {
  type: string;
  value: number;
  minSpend: number;
  expiresAt: Date | string | null;
  code: string | null;
  channel?: string | null;
}

/**
 * The mechanics, in plain lines: what you get, what you must spend, until
 * when, where, and how to claim it. Shown on the ordering website so a
 * customer knows the rules before they order.
 */
export function promoMechanics(
  p: PromoForMechanics,
  opts: { freeItemName?: string | null; now?: Date } = {},
): string[] {
  const lines: string[] = [];
  const offer = offerSummary({ type: p.type, value: p.value, freeItemId: null, minSpend: p.minSpend });
  if (p.type === "free_item" && opts.freeItemName) lines.push(`Free ${opts.freeItemName}`);
  else if (p.type === "bogo" && opts.freeItemName) lines.push(`Buy 1 ${opts.freeItemName}, get 1 free`);
  else if (offer) lines.push(offer);
  if (p.minSpend > 0) lines.push(`Minimum order of ${formatPeso(p.minSpend)}`);
  if (p.type === "free_delivery") lines.push("For delivery orders");
  const c = normalizePromoChannel(p.channel);
  if (c === "online") lines.push("Online orders only (delivery & pickup)");
  if (c === "dine_in") lines.push("Dine-in only");
  if (p.expiresAt) {
    const d = new Date(p.expiresAt);
    lines.push(
      `Valid until ${d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}`,
    );
  }
  // Info promos carry no code and apply nothing by themselves.
  if (p.code) lines.push(`Use code ${p.code.toUpperCase()} at checkout`);
  return lines;
}

/** What the ordering website shows for one promo — plain data, server-built. */
export interface StorefrontPromo {
  id: string;
  title: string;
  description: string | null;
  /** Upper-cased, or null for an info-only promo. */
  code: string | null;
  imageUrl: string | null;
  mechanics: string[];
}

/**
 * The promos the ordering website shows: only the ones that work online, each
 * with its mechanics spelled out. `itemNames` maps menu item id → name, for
 * "Free Halo-halo" rather than "Free item".
 */
export function storefrontPromos(
  promos: (PromoForMechanics & {
    id: string;
    title: string;
    description: string | null;
    freeItemId: string | null;
    imageUrl?: string | null;
  })[],
  itemNames: Map<string, string>,
  now: Date = new Date(),
): StorefrontPromo[] {
  return promos
    .filter((p) => promoAppliesTo(p.channel, "online"))
    .filter((p) => !p.expiresAt || new Date(p.expiresAt).getTime() > now.getTime())
    .map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      code: p.code ? p.code.toUpperCase() : null,
      imageUrl: p.imageUrl ?? null,
      mechanics: websiteMechanics(p, itemNames, now),
    }));
}

/**
 * The mechanics minus what the website card already says. The card shows the
 * title and the code with its own button, and everyone there is ordering
 * online, so these lines only repeat it:
 *  - the offer, when the title already names it ("Free Delivery");
 *  - "Online orders only" and "For delivery orders";
 *  - "Use code X at checkout".
 * What's left is what a customer could miss: the minimum order and the date.
 */
function websiteMechanics(
  p: PromoForMechanics & { title: string; freeItemId: string | null },
  itemNames: Map<string, string>,
  now: Date,
): string[] {
  const title = p.title.toLowerCase();
  const lines = promoMechanics(p, { freeItemName: p.freeItemId ? itemNames.get(p.freeItemId) : null, now });
  return lines.filter((line, i) => {
    if (i === 0 && p.type !== "info" && title.includes(line.toLowerCase())) return false;
    if (line === "For delivery orders") return false;
    if (line === "Online orders only (delivery & pickup)") return false;
    if (line.startsWith("Use code ")) return false;
    return true;
  });
}
