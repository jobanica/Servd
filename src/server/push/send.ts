import "server-only";

import webpush from "web-push";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Web Push sender for merchant devices. Needs VAPID keys in the environment:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (also read by the browser to subscribe)
 *   VAPID_PRIVATE_KEY             (server secret)
 *   VAPID_SUBJECT                 (mailto: or https URL; optional)
 * If they're missing, push is silently disabled — the in-app alarm still works.
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:orders@servd.app",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export interface OrderPushPayload {
  ref: string; // "#ABC123"
  orderType: string; // takeout | delivery
  total: number; // centavos
  scheduled?: boolean;
}

/**
 * Sends a "new order" push to every merchant device subscribed for this
 * restaurant. Best-effort: prunes dead subscriptions (410/404) and never throws.
 */
export async function sendOrderPush(restaurantId: string, payload: OrderPushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  let subs: { endpoint: string; p256dh: string; auth: string }[] = [];
  try {
    subs = await systemDb((tx) =>
      tx.pushSubscription.findMany({ where: { restaurantId }, select: { endpoint: true, p256dh: true, auth: true } }),
    );
  } catch {
    return; // table not migrated yet
  }
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: "New online order 🛎️",
    body: `${payload.orderType === "delivery" ? "🛵 Delivery" : "🥡 Pickup"} · ${payload.ref}${payload.scheduled ? " · advance order" : ""}`,
    url: "/merchant",
  });

  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint); // gone — prune
      }
    }),
  );

  if (dead.length) {
    try {
      await systemDb((tx) => tx.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } }));
    } catch { /* best-effort cleanup */ }
  }
}
