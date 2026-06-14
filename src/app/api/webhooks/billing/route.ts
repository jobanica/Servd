import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getBillingProvider } from "@/server/billing";
import { addMonths } from "@/lib/billing/period";

/**
 * Platform billing webhook (restaurant → Servd payments). The ONLY place an
 * invoice is marked paid + a subscription activated, after signature
 * verification. Also captures the saved card so future months charge
 * off-session.
 *
 * Configure in PayMongo (platform account): {APP_URL}/api/webhooks/billing
 */
export async function POST(req: NextRequest) {
  const provider = getBillingProvider();
  if (!provider) return new Response("Not configured", { status: 404 });

  const rawBody = await req.text();
  const signature = req.headers.get("paymongo-signature") ?? "";
  const event = provider.verifyAndParseWebhook(rawBody, signature);
  if (!event) return new Response("Invalid signature", { status: 400 });

  if (event.status !== "paid") return new Response("ok", { status: 200 });

  await systemDb(async (tx) => {
    const invoice = await tx.restaurantInvoice.findFirst({
      where: { providerRef: event.providerRef },
    });
    if (!invoice) return;

    const now = new Date();
    await tx.restaurantInvoice.update({
      where: { id: invoice.id },
      data: { status: "paid", paidAt: now },
    });

    const sub = await tx.subscription.findFirst({
      where: { restaurantId: invoice.restaurantId },
      orderBy: { createdAt: "desc" },
    });
    if (sub) {
      const base = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "active",
          currentPeriodEnd: addMonths(base, 1),
          failedCharges: 0,
          // Save the card for off-session renewals.
          ...(event.paymentMethodId ? { providerPaymentMethodId: event.paymentMethodId } : {}),
          ...(event.customerId ? { providerCustomerId: event.customerId } : {}),
        },
      });
    }
    // Paying clears any suspension.
    await tx.restaurant.update({ where: { id: invoice.restaurantId }, data: { status: "active" } });
  });

  return new Response("ok", { status: 200 });
}
