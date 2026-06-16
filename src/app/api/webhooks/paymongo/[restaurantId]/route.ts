import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getRestaurantGateway } from "@/server/payments/credentials";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { awardPointsForOrder } from "@/server/loyalty/loyalty";

/**
 * PayMongo webhook — the authoritative source of payment truth.
 *
 * We read the RAW body (signature is computed over it), verify it with THIS
 * restaurant's webhook secret, then mark the matching payments/orders. The
 * client is never trusted to confirm payment.
 *
 * Configure each restaurant's PayMongo webhook to:
 *   {APP_URL}/api/webhooks/paymongo/{restaurantId}
 *
 * Always returns 200 for handled-but-ignored events so PayMongo doesn't retry
 * forever; returns 400 only for invalid signatures.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const rawBody = await req.text();
  const signature = req.headers.get("paymongo-signature") ?? "";

  const gateway = await getRestaurantGateway(restaurantId);
  if (!gateway) return new Response("Not configured", { status: 404 });

  const event = gateway.verifyAndParseWebhook(rawBody, signature);
  if (!event) return new Response("Invalid signature", { status: 400 });

  if (event.status === "paid" || event.status === "failed") {
    const orderIds = await systemDb(async (tx) => {
      const payments = await tx.payment.findMany({
        where: { gatewayRef: event.gatewayRef },
        select: { id: true, orderId: true },
      });
      if (payments.length === 0) return [];

      await tx.payment.updateMany({
        where: { gatewayRef: event.gatewayRef },
        data: { status: event.status === "paid" ? "paid" : "failed" },
      });

      const ids = payments.map((p) => p.orderId);
      await tx.order.updateMany({
        where: { id: { in: ids } },
        data: {
          paymentStatus: event.status === "paid" ? "paid" : "failed",
          ...(event.status === "paid" ? { billRequested: false } : {}),
        },
      });
      return ids;
    });

    if (orderIds.length > 0) {
      await notifyOrdersChanged(restaurantId);
      // Award loyalty points for paid online orders (best-effort).
      if (event.status === "paid") {
        try {
          const orders = await systemDb((tx) =>
            tx.order.findMany({
              where: { id: { in: orderIds } },
              select: { id: true, total: true, customerPhone: true },
            }),
          );
          for (const o of orders) {
            await awardPointsForOrder(restaurantId, o.id, o.total, o.customerPhone);
          }
        } catch {
          /* loyalty never blocks the webhook */
        }
      }
    }
  }

  return new Response("ok", { status: 200 });
}
