import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getPlanAccess } from "@/server/billing/feature-gate";

/** Free tier's monthly online-ordering-website order allowance. */
export const FREE_WEB_ORDER_CAP = 100;

export interface WebOrderCapStatus {
  capped: boolean; // true = this restaurant is subject to the Free cap
  cap: number; // the monthly cap
  used: number; // web orders placed this calendar month
  remaining: number; // max(0, cap − used)
  reached: boolean; // used >= cap (block new web orders)
}

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Online-website orders placed this month (best-effort; 0 if column lags). */
async function webOrdersThisMonth(restaurantId: string): Promise<number> {
  try {
    return await systemDb((tx) =>
      tx.order.count({ where: { restaurantId, source: "web", createdAt: { gte: monthStartUtc() } } }),
    );
  } catch {
    return 0; // `source` column not migrated yet → don't block
  }
}

/**
 * The Free plan allows up to FREE_WEB_ORDER_CAP online orders per calendar
 * month; paid plans and active trials are uncapped. Returns current usage and
 * whether the cap has been reached.
 */
export async function getWebOrderCapStatus(restaurantId: string): Promise<WebOrderCapStatus> {
  const cap = FREE_WEB_ORDER_CAP;
  const { tier, onTrial } = await getPlanAccess(restaurantId);
  // Only the Free tier (and not during an active trial) is capped.
  if (tier !== "Free" || onTrial) {
    return { capped: false, cap, used: 0, remaining: cap, reached: false };
  }
  const used = await webOrdersThisMonth(restaurantId);
  return { capped: true, cap, used, remaining: Math.max(0, cap - used), reached: used >= cap };
}
