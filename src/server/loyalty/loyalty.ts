import "server-only";

import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";

export interface LoyaltyConfig {
  enabled: boolean;
  pesosPerPoint: number; // ₱ spent to earn 1 point
  pointValue: number; // centavos a point is worth on redeem
}

const DEFAULT_CONFIG: LoyaltyConfig = { enabled: false, pesosPerPoint: 20, pointValue: 100 };

/** Loyalty settings for a restaurant (best-effort — columns may lag on prod). */
export async function getLoyaltyConfig(restaurantId: string): Promise<LoyaltyConfig> {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { id: restaurantId },
        select: { loyaltyEnabled: true, loyaltyPesosPerPoint: true, loyaltyPointValue: true },
      }),
    );
    if (!r) return DEFAULT_CONFIG;
    return {
      enabled: r.loyaltyEnabled,
      pesosPerPoint: r.loyaltyPesosPerPoint || 20,
      pointValue: r.loyaltyPointValue || 100,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "").trim();
}

/** A customer's current point balance (0 if none / not enabled). */
export async function getBalance(restaurantId: string, phone: string): Promise<number> {
  const p = normalizePhone(phone);
  if (!p) return 0;
  try {
    const acct = await systemDb((tx) =>
      tx.loyaltyAccount.findFirst({
        where: { restaurantId, phone: p },
        select: { points: true },
      }),
    );
    return acct?.points ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Award points for a paid order. Idempotent per order (won't double-award).
 * Best-effort: never throws into the payment flow.
 */
export async function awardPointsForOrder(
  restaurantId: string,
  orderId: string,
  netPaidCentavos: number,
  phone: string | null,
): Promise<void> {
  const p = phone ? normalizePhone(phone) : "";
  if (!p) return;
  try {
    const cfg = await getLoyaltyConfig(restaurantId);
    if (!cfg.enabled) return;
    const pesos = Math.floor(netPaidCentavos / 100);
    const points = Math.floor(pesos / cfg.pesosPerPoint);
    if (points <= 0) return;

    await tenantDb(restaurantId, async (tx) => {
      // Idempotency: skip if we already awarded for this order.
      const existing = await tx.loyaltyTransaction.findFirst({
        where: { orderId, kind: "earn" },
        select: { id: true },
      });
      if (existing) return;

      await tx.loyaltyAccount.upsert({
        where: { restaurantId_phone: { restaurantId, phone: p } },
        create: { restaurantId, phone: p, points, totalEarned: points },
        update: { points: { increment: points }, totalEarned: { increment: points } },
      });
      await tx.loyaltyTransaction.create({
        data: { restaurantId, phone: p, orderId, points, kind: "earn" },
      });
    });
  } catch {
    // loyalty must never block payment
  }
}

/** Deduct points when a redemption is confirmed. Returns the centavos value. */
export async function redeemPoints(
  restaurantId: string,
  phone: string,
  points: number,
): Promise<{ ok: boolean; value?: number; balance?: number; error?: string }> {
  const p = normalizePhone(phone);
  if (!p) return { ok: false, error: "Enter a phone number." };
  if (!Number.isFinite(points) || points <= 0) return { ok: false, error: "Enter points to redeem." };

  const cfg = await getLoyaltyConfig(restaurantId);
  if (!cfg.enabled) return { ok: false, error: "Loyalty isn't enabled." };

  try {
    return await tenantDb(restaurantId, async (tx) => {
      const acct = await tx.loyaltyAccount.findFirst({ where: { restaurantId, phone: p } });
      if (!acct || acct.points < points) {
        return { ok: false, error: `Not enough points (balance: ${acct?.points ?? 0}).` };
      }
      await tx.loyaltyAccount.update({
        where: { id: acct.id },
        data: { points: { decrement: points } },
      });
      await tx.loyaltyTransaction.create({
        data: { restaurantId, phone: p, points: -points, kind: "redeem" },
      });
      return { ok: true, value: points * cfg.pointValue, balance: acct.points - points };
    });
  } catch {
    return { ok: false, error: "Couldn't redeem points." };
  }
}
