/**
 * Delivery batches — the rider goes out at set times, not once per order.
 *
 * Built for a subdivision run on table-tent QR codes: households order through
 * the storefront and choose when they want it, the kitchen cooks to the batch,
 * and one rider trip carries every order in that window. The owner sets service
 * periods (lunch 11:00–13:00, dinner 16:30–20:00) and a batch length (30 min),
 * and the batches fall out of that: 11:00–11:30, 11:30–12:00, …
 *
 * The ordering rule is the one the owner described: an order placed before a
 * batch starts can go in it. So 10:30–11:00 orders reach the 11:00–11:30 batch,
 * 11:00–11:30 orders the 11:30–12:00 one. A cutoff (minutes before the batch
 * starts) tightens that when the kitchen needs time; it defaults to 0.
 *
 * Pure, and in Manila time throughout — the server runs in UTC, and a window
 * computed in UTC would be eight hours out. Shared by the settings screen, the
 * checkout, and the order path, which re-checks whatever the customer picked.
 */

import { manilaStartOfDay } from "@/lib/time/manila";

export interface ServicePeriod {
  start: string; // "HH:MM", Manila
  end: string; // "HH:MM", Manila
}

export interface DeliveryWindowsConfig {
  enabled: boolean;
  periods: ServicePeriod[];
  /** Length of one batch, in minutes. */
  batchMinutes: number;
  /** Stop taking orders for a batch this many minutes before it starts. */
  cutoffMinutes: number;
}

export interface DeliveryWindow {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export const DEFAULT_DELIVERY_WINDOWS: DeliveryWindowsConfig = {
  enabled: false,
  // The owner's own example: four lunch batches and seven dinner ones.
  periods: [
    { start: "11:00", end: "13:00" },
    { start: "16:30", end: "20:00" },
  ],
  batchMinutes: 30,
  cutoffMinutes: 0,
};

export const BATCH_MINUTE_CHOICES = [15, 20, 30, 45, 60] as const;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(hhmm: string): number | null {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Clean a config read from storage or a form. Anything malformed falls back
 * to the default rather than throwing — the storefront must still load, and a
 * bad period simply produces no batches.
 */
export function normalizeDeliveryWindows(raw: unknown): DeliveryWindowsConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const batch = Number(r.batchMinutes);
  const cutoff = Number(r.cutoffMinutes);
  const periods = Array.isArray(r.periods)
    ? (r.periods as unknown[])
        .map((p) => {
          const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
          return { start: String(o.start ?? ""), end: String(o.end ?? "") };
        })
        .filter((p) => {
          const s = toMinutes(p.start);
          const e = toMinutes(p.end);
          return s != null && e != null && e > s;
        })
        .slice(0, 6)
    : DEFAULT_DELIVERY_WINDOWS.periods;
  return {
    enabled: r.enabled === true,
    periods,
    batchMinutes: (BATCH_MINUTE_CHOICES as readonly number[]).includes(batch)
      ? batch
      : DEFAULT_DELIVERY_WINDOWS.batchMinutes,
    cutoffMinutes: Number.isFinite(cutoff) ? Math.min(120, Math.max(0, Math.round(cutoff))) : 0,
  };
}

/**
 * Every batch in a day, in order.
 *
 * A period that doesn't divide evenly keeps its last, shorter batch rather than
 * dropping it: the owner said dinner runs to 20:00, so the last batch ends at
 * 20:00 whatever the length. Overlapping periods are merged by start time so a
 * typo can't list the same batch twice.
 */
export function batchesFor(cfg: Pick<DeliveryWindowsConfig, "periods" | "batchMinutes">): DeliveryWindow[] {
  const len = Math.max(5, cfg.batchMinutes);
  const seen = new Set<number>();
  const out: { s: number; e: number }[] = [];
  for (const p of cfg.periods) {
    const s0 = toMinutes(p.start);
    const e0 = toMinutes(p.end);
    if (s0 == null || e0 == null || e0 <= s0) continue;
    for (let s = s0; s < e0; s += len) {
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({ s, e: Math.min(s + len, e0) });
    }
  }
  return out.sort((a, b) => a.s - b.s).map((w) => ({ start: fromMinutes(w.s), end: fromMinutes(w.e) }));
}

/** The UTC instant a "HH:MM" Manila time falls on, on the Manila day of `ref`. */
export function windowInstant(hhmm: string, ref: Date): Date {
  const mins = toMinutes(hhmm) ?? 0;
  return new Date(manilaStartOfDay(ref).getTime() + mins * 60_000);
}

/**
 * Today's batches a customer can still choose, earliest first.
 *
 * A batch is open while `now` is before its start less the cutoff. Equal to
 * the start counts as closed: an order placed at exactly 11:00 goes to the
 * 11:30 batch, as the owner described.
 */
export function openBatches(cfg: DeliveryWindowsConfig, now: Date): DeliveryWindow[] {
  if (!cfg.enabled) return [];
  return batchesFor(cfg).filter(
    (w) => now.getTime() < windowInstant(w.start, now).getTime() - cfg.cutoffMinutes * 60_000,
  );
}

/** Is this the start of a batch the customer may still pick right now? */
export function findOpenBatch(
  cfg: DeliveryWindowsConfig,
  start: string,
  now: Date,
): DeliveryWindow | null {
  return openBatches(cfg, now).find((w) => w.start === start) ?? null;
}

function clock(hhmm: string): { text: string; ampm: "AM" | "PM" } {
  const mins = toMinutes(hhmm) ?? 0;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { text: `${h12}:${String(m).padStart(2, "0")}`, ampm };
}

/**
 * "11:00–11:30 AM", or "11:30 AM–12:00 PM" across noon.
 *
 * `ascii` uses a plain hyphen, for the thermal printer: its encoder drops
 * anything past 0xFF and a codepage printer renders the en dash as junk.
 */
export function batchLabel(w: DeliveryWindow, opts: { ascii?: boolean } = {}): string {
  const dash = opts.ascii ? "-" : "–";
  const a = clock(w.start);
  const b = clock(w.end);
  return a.ampm === b.ampm
    ? `${a.text}${dash}${b.text} ${b.ampm}`
    : `${a.text} ${a.ampm}${dash}${b.text} ${b.ampm}`;
}

/** Same label, from the stored instants on an order. */
export function batchLabelFromInstants(start: Date | string, end: Date | string, opts: { ascii?: boolean } = {}): string {
  const toHHMM = (d: Date | string) => {
    const ms = new Date(d).getTime() + 8 * 60 * 60 * 1000;
    const t = new Date(ms);
    return fromMinutes(t.getUTCHours() * 60 + t.getUTCMinutes());
  };
  return batchLabel({ start: toHHMM(start), end: toHHMM(end) }, opts);
}

/** The "[Deliver 11:00-11:30 AM] " tag the order path puts on the address. */
export const BATCH_ADDRESS_TAG = /^\[Deliver [^\]]*\]\s*/;

/** The address without the batch tag, for screens that show the batch already. */
export function stripBatchTag(address: string): string {
  return address.replace(BATCH_ADDRESS_TAG, "");
}

export interface BatchGroup<T> {
  /** ISO start of the batch, or null for orders that aren't in one. */
  start: string | null;
  label: string | null;
  orders: T[];
}

/**
 * Orders bucketed by delivery batch, for the rider: one group per run, in the
 * order they go out. Orders without a batch (pick-up, or placed before batches
 * were switched on) come first, as they're due as soon as they're ready. Order
 * within a group is kept as given.
 */
export function groupByBatch<T extends { deliveryWindowStart: string | null; deliveryWindowEnd: string | null }>(
  orders: T[],
): BatchGroup<T>[] {
  const loose: T[] = [];
  const byStart = new Map<string, BatchGroup<T>>();
  for (const o of orders) {
    if (!o.deliveryWindowStart || !o.deliveryWindowEnd) {
      loose.push(o);
      continue;
    }
    let g = byStart.get(o.deliveryWindowStart);
    if (!g) {
      g = {
        start: o.deliveryWindowStart,
        label: batchLabelFromInstants(o.deliveryWindowStart, o.deliveryWindowEnd),
        orders: [],
      };
      byStart.set(o.deliveryWindowStart, g);
    }
    g.orders.push(o);
  }
  const batches = [...byStart.values()].sort(
    (a, b) => new Date(a.start!).getTime() - new Date(b.start!).getTime(),
  );
  return loose.length ? [{ start: null, label: null, orders: loose }, ...batches] : batches;
}
