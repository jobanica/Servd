import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { awardPointsForOrder } from "@/server/loyalty/loyalty";
import type { WebhookEvent } from "./gateway";

/**
 * Applies a signature-verified payment webhook to the matching orders. Shared by
 * every gateway's webhook route so the order/payment/loyalty side-effects stay
 * identical. The caller must verify the signature FIRST — this trusts `event`.
 */
export async function applyPaymentWebhook(
  restaurantId: string,
  event: WebhookEvent,
): Promise<void> {
  if (event.status !== "paid" && event.status !== "failed") return;

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

  if (orderIds.length === 0) return;

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
