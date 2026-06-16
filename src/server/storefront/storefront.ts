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
export interface Storefront {
  hours: DayHours[]; // always length 7, index 0=Sun … 6=Sat
  zones: DeliveryZone[];
  pauseWhenClosed: boolean;
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

/** Storefront settings (admin context). Resilient to a missing table. */
export async function getStorefront(restaurantId: string): Promise<Storefront> {
  try {
    const s = await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { hours: true, deliveryZones: true, pauseWhenClosed: true } }),
    );
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false };
  }
}

/** Public storefront for the website (system context). */
export async function getPublicStorefront(restaurantId: string): Promise<Storefront> {
  try {
    const s = await systemDb((tx) =>
      tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { hours: true, deliveryZones: true, pauseWhenClosed: true } }),
    );
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false };
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
