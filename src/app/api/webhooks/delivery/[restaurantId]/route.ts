import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { resolveProvider } from "@/server/delivery/provider";
import { notifyOrdersChanged } from "@/server/realtime/notify";

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
      select: { orderId: true },
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
    return booking.orderId;
  }).catch(() => null);

  if (matched) await notifyOrdersChanged(restaurantId);
  return new Response("ok", { status: 200 });
}
