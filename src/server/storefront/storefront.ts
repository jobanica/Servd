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
export interface PaymentConfig {
  codEnabled: boolean; // cash on delivery / on pickup
  codFeeEnabled: boolean; // charge an extra fee on cash-on-delivery orders
  codFee: number; // centavos added to delivery orders paid by cash
  gcashEnabled: boolean;
  gcashName: string; // account name shown to the customer
  gcashNumber: string; // GCash mobile number
  gcashQrUrl: string; // uploaded QR image URL
}
export interface DeliveryConfig {
  mode: "zones" | "distance"; // how the delivery fee is worked out
  baseFee: number; // centavos
  perKm: number; // centavos per km
  freeKm: number; // first N km included in base
  minFee: number; // centavos minimum (0 = ignore)
  maxKm: number; // don't deliver beyond this (0 = unlimited)
  roadFactor: number; // straight-line × factor ≈ road distance (default 1.3)
  originLat: number | null; // store location (pinned by the owner)
  originLng: number | null;
  feeInTotal: boolean; // true = add the fee to the order total (pay in-app);
  //                      false = customer pays the rider directly (food only in-app)
}
export interface Storefront {
  hours: DayHours[]; // always length 7, index 0=Sun … 6=Sat
  zones: DeliveryZone[];
  pauseWhenClosed: boolean;
  acceptsBookings: boolean; // website "Book a table" flow enabled
  booking: BookingConfig; // advance-order downpayment / approval settings
  payment: PaymentConfig; // manual GCash / cash settings
  delivery: DeliveryConfig; // zones vs distance-based fee
}

export function defaultDeliveryConfig(): DeliveryConfig {
  return { mode: "zones", baseFee: 0, perKm: 0, freeKm: 0, minFee: 0, maxKm: 0, roadFactor: 1.3, originLat: null, originLng: null, feeInTotal: true };
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDeliveryConfig(raw: unknown): DeliveryConfig {
  const d = defaultDeliveryConfig();
  if (raw && typeof raw === "object") {
    const r = raw as Partial<DeliveryConfig>;
    return {
      mode: r.mode === "distance" ? "distance" : "zones",
      baseFee: Math.max(0, Math.round(num(r.baseFee))),
      perKm: Math.max(0, Math.round(num(r.perKm))),
      freeKm: Math.max(0, num(r.freeKm)),
      minFee: Math.max(0, Math.round(num(r.minFee))),
      maxKm: Math.max(0, num(r.maxKm)),
      roadFactor: num(r.roadFactor, 1.3) > 0 ? num(r.roadFactor, 1.3) : 1.3,
      originLat: r.originLat == null ? null : num(r.originLat),
      originLng: r.originLng == null ? null : num(r.originLng),
      // Default true (fee included) so existing stores are unchanged.
      feeInTotal: r.feeInTotal === undefined ? true : !!r.feeInTotal,
    };
  }
  return d;
}

export function defaultPaymentConfig(): PaymentConfig {
  return { codEnabled: true, codFeeEnabled: false, codFee: 0, gcashEnabled: false, gcashName: "", gcashNumber: "", gcashQrUrl: "" };
}

function normalizePaymentConfig(raw: unknown): PaymentConfig {
  const d = defaultPaymentConfig();
  if (raw && typeof raw === "object") {
    const r = raw as Partial<PaymentConfig>;
    return {
      // Cash defaults ON so every store always has at least one method.
      codEnabled: r.codEnabled === undefined ? true : !!r.codEnabled,
      codFeeEnabled: !!r.codFeeEnabled,
      codFee: Math.max(0, Math.round(Number(r.codFee) || 0)),
      gcashEnabled: !!r.gcashEnabled,
      gcashName: typeof r.gcashName === "string" ? r.gcashName.slice(0, 120) : "",
      gcashNumber: typeof r.gcashNumber === "string" ? r.gcashNumber.slice(0, 40) : "",
      gcashQrUrl: typeof r.gcashQrUrl === "string" ? r.gcashQrUrl.slice(0, 500) : "",
    };
  }
  return d;
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
    let payment = defaultPaymentConfig();
    let delivery = defaultDeliveryConfig();
    try {
      const b = await tenantDb(restaurantId, (tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { acceptsBookings: true, bookingConfig: true, paymentConfig: true, deliveryConfig: true } }),
      );
      acceptsBookings = !!b?.acceptsBookings;
      booking = normalizeBookingConfig(b?.bookingConfig);
      payment = normalizePaymentConfig(b?.paymentConfig);
      delivery = normalizeDeliveryConfig(b?.deliveryConfig);
    } catch { /* columns not migrated yet */ }
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed, acceptsBookings, booking, payment, delivery };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false, acceptsBookings: false, booking: defaultBookingConfig(), payment: defaultPaymentConfig(), delivery: defaultDeliveryConfig() };
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
    let payment = defaultPaymentConfig();
    let delivery = defaultDeliveryConfig();
    try {
      const b = await systemDb((tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { acceptsBookings: true, bookingConfig: true, paymentConfig: true, deliveryConfig: true } }),
      );
      acceptsBookings = !!b?.acceptsBookings;
      booking = normalizeBookingConfig(b?.bookingConfig);
      payment = normalizePaymentConfig(b?.paymentConfig);
      delivery = normalizeDeliveryConfig(b?.deliveryConfig);
    } catch { /* columns not migrated yet */ }
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed, acceptsBookings, booking, payment, delivery };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false, acceptsBookings: false, booking: defaultBookingConfig(), payment: defaultPaymentConfig(), delivery: defaultDeliveryConfig() };
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
