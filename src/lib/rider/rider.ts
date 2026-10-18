/**
 * The Rider app's rules, kept pure so they can be tested without a database.
 *
 * A rider sees the shop's delivery orders, takes one ("Pick up"), and hands it
 * over ("Delivered"), saying how the customer paid at the door: cash, GCash
 * (with a photo of the receipt) or nothing, because it was paid online already.
 */

export type RiderPayMethod = "cash" | "gcash" | "prepaid";

export const RIDER_PAY_METHODS: readonly RiderPayMethod[] = ["cash", "gcash", "prepaid"];

export function isRiderPayMethod(x: unknown): x is RiderPayMethod {
  return typeof x === "string" && (RIDER_PAY_METHODS as readonly string[]).includes(x);
}

/** What the customer still owes, in centavos: total less discount and gift-card credit. */
export function amountDue(o: { total: number; discountAmount?: number | null; creditApplied?: number | null }): number {
  return Math.max(0, o.total - (o.discountAmount ?? 0) - (o.creditApplied ?? 0));
}

/** Where an order stands, as a rider sees it. */
export type RiderStage = "preparing" | "ready" | "on_the_way";

export function riderStage(o: { status: string; deliveryStatus: string | null }): RiderStage {
  if (o.deliveryStatus === "out_for_delivery") return "on_the_way";
  return o.status === "done" ? "ready" : "preparing";
}

/** Order statuses a rider may pick up from: accepted, not yet closed. */
export const PICKUP_STATUSES = ["new", "preparing", "done"] as const;

/** Turn-by-turn directions in Google Maps: the pin when there is one, else the address. */
export function directionsUrl(lat: number | null, lng: number | null, address: string | null): string | null {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  const a = (address ?? "").replace(/\[[^\]]*\]\s*/g, "").trim();
  return a ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}` : null;
}

/** Change to bring, when a cash customer said what they'll pay with. */
export function changeFor(due: number, tendered: number | null | undefined): number | null {
  if (!tendered || tendered <= due) return null;
  return tendered - due;
}

export interface DaySummary {
  delivered: number;
  cash: number; // centavos collected in cash
  gcash: number; // centavos paid by GCash at the door
  prepaid: number; // deliveries already paid online — nothing to collect
  collected: number; // cash + gcash
}

/** A rider's day: how many delivered, and what they collected, by method. */
export function summarizeDeliveries(
  rows: { riderPayMethod: string | null; riderCollected: number | null }[],
): DaySummary {
  const s: DaySummary = { delivered: 0, cash: 0, gcash: 0, prepaid: 0, collected: 0 };
  for (const r of rows) {
    s.delivered++;
    const amt = Math.max(0, r.riderCollected ?? 0);
    if (r.riderPayMethod === "cash") s.cash += amt;
    else if (r.riderPayMethod === "gcash") s.gcash += amt;
    else s.prepaid++;
  }
  s.collected = s.cash + s.gcash;
  return s;
}

/** The owner's view of a day: each rider's own summary, busiest first. */
export function summarizeByRider<T extends { riderId: string | null; riderPayMethod: string | null; riderCollected: number | null }>(
  rows: T[],
): { riderId: string; summary: DaySummary; rows: T[] }[] {
  const by = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.riderId) continue;
    const list = by.get(r.riderId) ?? [];
    list.push(r);
    by.set(r.riderId, list);
  }
  return [...by.entries()]
    .map(([riderId, list]) => ({ riderId, summary: summarizeDeliveries(list), rows: list }))
    .sort((a, b) => b.summary.delivered - a.summary.delivered);
}

/** A "YYYY-MM-DD" Manila date → the UTC instant that day starts. Null when malformed. */
export function manilaDayStart(day: string | null | undefined): Date | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The Manila calendar date of an instant, as "YYYY-MM-DD". */
export function manilaDate(at: Date = new Date()): string {
  return new Date(at.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
