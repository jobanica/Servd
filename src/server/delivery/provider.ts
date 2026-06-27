import "server-only";

/**
 * Provider-agnostic third-party delivery interface — a FUTURE HOOK, intentionally
 * a stub. The merchant screen currently fulfils delivery manually (the staff use
 * their own rider and tap "Out for delivery" / "Delivered"). When a local Davao
 * delivery API (e.g. a Lalamove-style provider) is integrated, implement this
 * interface in a new file and register it below — no merchant-screen rewiring.
 *
 * Nothing here books real rides yet; `ManualDeliveryProvider` just mirrors the
 * manual flow so callers can depend on the interface today.
 */

export interface DeliveryQuote {
  fee: number; // centavos
  etaMinutes: number | null;
  currency: "PHP";
}

export interface DeliveryBookingRequest {
  orderId: string;
  pickup: { name: string; address: string; lat?: number | null; lng?: number | null; phone?: string | null };
  dropoff: { name: string; address: string; lat?: number | null; lng?: number | null; phone?: string | null };
  note?: string | null;
}

export type DeliveryJobStatus =
  | "pending" // requested, no rider yet
  | "assigned" // rider assigned
  | "picked_up" // rider has the order
  | "delivered"
  | "cancelled"
  | "manual"; // fulfilled by the restaurant's own rider (no provider)

export interface DeliveryJob {
  id: string; // provider job id (or a local id for manual)
  provider: string; // provider key, e.g. "manual" | "lalamove" | "davao_local"
  status: DeliveryJobStatus;
  fee: number; // centavos
  etaMinutes: number | null;
  riderName?: string | null;
  riderPhone?: string | null;
  trackingUrl?: string | null;
}

/**
 * A pluggable third-party delivery provider. Keep this small and stable; each
 * real provider (Lalamove, a Davao-local API, …) implements it behind its own
 * adapter so the rest of the app never imports provider SDKs directly.
 */
export interface DeliveryProvider {
  readonly key: string;
  /** Price + ETA for a prospective booking (null if the area isn't serviceable). */
  quote(req: DeliveryBookingRequest): Promise<DeliveryQuote | null>;
  /** Book a rider for an accepted order. */
  book(req: DeliveryBookingRequest): Promise<DeliveryJob>;
  /** Current status of a booked job. */
  getStatus(jobId: string): Promise<DeliveryJob>;
  /** Cancel a booked job (best-effort; returns the final job state). */
  cancel(jobId: string): Promise<DeliveryJob>;
}

/**
 * The default "provider": no external integration. Booking returns a `manual`
 * job so the merchant keeps driving delivery by hand (Out for delivery →
 * Delivered) exactly as today. Swap this out once a real provider exists.
 */
export const ManualDeliveryProvider: DeliveryProvider = {
  key: "manual",
  async quote() {
    return null; // unknown — the restaurant sets its own delivery fee/zones
  },
  async book(req) {
    return {
      id: `manual:${req.orderId}`,
      provider: "manual",
      status: "manual",
      fee: 0,
      etaMinutes: null,
    };
  },
  async getStatus(jobId) {
    return { id: jobId, provider: "manual", status: "manual", fee: 0, etaMinutes: null };
  },
  async cancel(jobId) {
    return { id: jobId, provider: "manual", status: "cancelled", fee: 0, etaMinutes: null };
  },
};

/**
 * Resolve the active delivery provider for a restaurant. For now always the
 * manual stub; later this can look up a per-restaurant provider config and
 * return the matching adapter.
 */
export function getDeliveryProvider(_restaurantId: string): DeliveryProvider {
  return ManualDeliveryProvider;
}
