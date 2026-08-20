import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { resolveProvider } from "@/server/delivery/provider";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { sendDinerPush } from "@/server/push/send";

/**
 * Inbound delivery-status webhook for API providers. Mirrors the PayMongo
 * webhook: read the RAW body, verify the signature with THIS restaurant's stored
 * webhook secret (inside the provider adapter), then update the matching booking
 * + order and ping realtime. Always 200 for handled events so the provider
 * doesn't retry forever; 400 only on a bad signature.
 *
 * Configure each restaurant's provider webhook to:
 *   {APP_URL}/api/webhooks/delivery/{restaurantId}
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const rawBody = await req.text();

  const resolved = await resolveProvider(restaurantId);
  if (resolved.mode !== "api" || !resolved.provider.verifyWebhook) {
    return new Response("Not configured", { status: 404 });
  }

  const update = resolved.provider.verifyWebhook(rawBody, req.headers);
  if (!update) return new Response("Invalid signature", { status: 400 });

  const matched = await systemDb(async (tx) => {
    const booking = await tx.deliveryBooking.findFirst({
      where: { restaurantId, bookingRef: update.bookingRef },
      select: { orderId: true, arrivedAt: true },
    });
    if (!booking) return null;

    await tx.deliveryBooking.updateMany({
      where: { restaurantId, bookingRef: update.bookingRef },
      data: {
        status: update.status,
        riderName: update.riderName ?? undefined,
        riderPhone: update.riderPhone ?? undefined,
        riderLat: update.riderLat ?? undefined,
        riderLng: update.riderLng ?? undefined,
        trackingUrl: update.trackingUrl ?? undefined,
        etaMinutes: update.etaMinutes ?? undefined,
        arrivedAt: update.arrivedAt ? new Date(update.arrivedAt) : undefined,
        // Only the rider's side is kept. What the diner typed they already have.
        lastMessageAt:
          update.message && update.message.from === "rider" && update.message.at
            ? new Date(update.message.at)
            : undefined,
        lastMessageBody:
          update.message && update.message.from === "rider" ? update.message.body ?? undefined : undefined,
      },
    });

    // Mirror onto the order so the customer's live tracker + boards reflect it.
    if (update.status === "picked_up") {
      await tx.order.updateMany({ where: { id: booking.orderId }, data: { deliveryStatus: "out_for_delivery" } });
    } else if (update.status === "delivered") {
      await tx.order.updateMany({
        where: { id: booking.orderId },
        data: { deliveryStatus: "delivered", status: "closed", paymentStatus: "paid", billRequested: false },
      });
    }
    // Arriving twice is one arrival: the first stamp wins, so a retried
    // callback does not ring the diner's phone again.
    return { orderId: booking.orderId, wasArrived: Boolean(booking.arrivedAt) };
  }).catch(() => null);

  if (matched) {
    await notifyOrdersChanged(restaurantId);
    await tellTheDiner(restaurantId, matched.orderId, matched.wasArrived, update);
  }
  return new Response("ok", { status: 200 });
}

/**
 * The two moments worth waking a phone for.
 *
 * Everything else on this order the diner can find by looking at the tracker;
 * these two are the ones where somebody is waiting on *them*. Best-effort by
 * design — a push that fails must not turn a delivered order into a 500 and a
 * provider retry.
 */
async function tellTheDiner(
  restaurantId: string,
  orderId: string,
  wasArrived: boolean,
  update: { arrivedAt?: string | null; message?: { from: string; body: string | null } | null },
): Promise<void> {
  const url = await dinerTrackerUrl(restaurantId, orderId);
  try {
    if (update.arrivedAt && !wasArrived) {
      await sendDinerPush(orderId, {
        title: "Your rider is outside 🛵",
        body: "They are at your address with your order.",
        url,
        tag: `arrived-${orderId}`,
      });
    }
    if (update.message?.from === "rider" && update.message.body) {
      await sendDinerPush(orderId, {
        title: "Message from your rider 💬",
        body: update.message.body.slice(0, 140),
        url,
        tag: `chat-${orderId}`,
      });
    }
  } catch {
    /* the tracker still updates on its own */
  }
}

/** Where the diner's own order lives, for the notification to open. */
async function dinerTrackerUrl(restaurantId: string, orderId: string): Promise<string> {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id: restaurantId }, select: { slug: true } }),
    );
    return r?.slug ? `/r/${r.slug}/order/${orderId}` : "/";
  } catch {
    return "/";
  }
}
