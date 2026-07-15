import "server-only";

import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";

export interface DayHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}
export interface DeliveryZone {
  name: string;
  fee: number; // centavos
}
export interface BookingConfig {
  requireDownpayment: boolean;
  downpaymentType: "percent" | "fixed"; // percent of total, or a fixed peso amount
  downpaymentValue: number; // percent (0–100) or centavos, per downpaymentType
  downpaymentInstructions: string; // e.g. "Send GCash to 0917… and enter the ref below"
}
export interface Storefront {
  hours: DayHours[]; // always length 7, index 0=Sun … 6=Sat
  zones: DeliveryZone[];
  pauseWhenClosed: boolean;
  acceptsBookings: boolean; // website "Book a table" flow enabled
  booking: BookingConfig; // advance-order downpayment / approval settings
}

export function defaultBookingConfig(): BookingConfig {
  return { requireDownpayment: false, downpaymentType: "percent", downpaymentValue: 50, downpaymentInstructions: "" };
}

function normalizeBookingConfig(raw: unknown): BookingConfig {
  const d = defaultBookingConfig();
  if (raw && typeof raw === "object") {
    const r = raw as Partial<BookingConfig>;
    return {
      requireDownpayment: !!r.requireDownpayment,
      downpaymentType: r.downpaymentType === "fixed" ? "fixed" : "percent",
      downpaymentValue: Math.max(0, Math.round(Number(r.downpaymentValue) || 0)) || d.downpaymentValue,
      downpaymentInstructions: typeof r.downpaymentInstructions === "string" ? r.downpaymentInstructions.slice(0, 500) : "",
    };
  }
  return d;
}

/** The downpayment a given order total requires under a booking config (centavos). */
export function computeDownpayment(cfg: BookingConfig, total: number): number {
  if (!cfg.requireDownpayment) return 0;
  const amt = cfg.downpaymentType === "percent"
    ? Math.round((total * cfg.downpaymentValue) / 100)
    : cfg.downpaymentValue;
  return Math.max(0, Math.min(total, amt)); // never more than the order total
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultHours(): DayHours[] {
  return Array.from({ length: 7 }, () => ({ open: "09:00", close: "21:00", closed: false }));
}

function normalizeHours(raw: unknown): DayHours[] {
  const out = defaultHours();
  if (Array.isArray(raw)) {
    for (let i = 0; i < 7; i++) {
      const r = raw[i] as Partial<DayHours> | undefined;
      if (r && typeof r === "object") {
        out[i] = {
          open: typeof r.open === "string" ? r.open : "09:00",
          close: typeof r.close === "string" ? r.close : "21:00",
          closed: !!r.closed,
        };
      }
    }
  }
  return out;
}

function normalizeZones(raw: unknown): DeliveryZone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((z) => ({ name: String((z as DeliveryZone)?.name ?? "").trim(), fee: Math.max(0, Math.round(Number((z as DeliveryZone)?.fee) || 0)) }))
    .filter((z) => z.name);
}

/** Storefront settings (admin context). Resilient to a missing table.
 * `acceptsBookings` ships in a later migration than hours/zones, so it's read in
 * its own best-effort query — a missing column can never wipe the core settings. */
export async function getStorefront(restaurantId: string): Promise<Storefront> {
  try {
    const s = await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { hours: true, deliveryZones: true, pauseWhenClosed: true } }),
    );
    let acceptsBookings = false;
    let booking = defaultBookingConfig();
    try {
      const b = await tenantDb(restaurantId, (tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { acceptsBookings: true, bookingConfig: true } }),
      );
      acceptsBookings = !!b?.acceptsBookings;
      booking = normalizeBookingConfig(b?.bookingConfig);
    } catch { /* columns not migrated yet */ }
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed, acceptsBookings, booking };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false, acceptsBookings: false, booking: defaultBookingConfig() };
  }
}

/** Public storefront for the website (system context). */
export async function getPublicStorefront(restaurantId: string): Promise<Storefront> {
  try {
    const s = await systemDb((tx) =>
      tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { hours: true, deliveryZones: true, pauseWhenClosed: true } }),
    );
    let acceptsBookings = false;
    let booking = defaultBookingConfig();
    try {
      const b = await systemDb((tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { acceptsBookings: true, bookingConfig: true } }),
      );
      acceptsBookings = !!b?.acceptsBookings;
      booking = normalizeBookingConfig(b?.bookingConfig);
    } catch { /* columns not migrated yet */ }
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed, acceptsBookings, booking };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false, acceptsBookings: false, booking: defaultBookingConfig() };
  }
}

/** Whether the store is open at the given moment (PH time, UTC+8). */
export function isOpenNow(hours: DayHours[], now = new Date()): boolean {
  const ph = new Date(now.getTime() + 8 * 3600000); // shift to UTC+8
  const day = ph.getUTCDay();
  const today = hours[day];
  if (!today || today.closed) return false;
  const mins = ph.getUTCHours() * 60 + ph.getUTCMinutes();
  const [oh, om] = today.open.split(":").map(Number);
  const [ch, cm] = today.close.split(":").map(Number);
  const openM = oh * 60 + om;
  const closeM = ch * 60 + cm;
  // Handle past-midnight close (e.g. 18:00–02:00).
  if (closeM <= openM) return mins >= openM || mins < closeM;
  return mins >= openM && mins < closeM;
}
