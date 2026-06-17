import { NextRequest } from "next/server";
import { getBillingProvider } from "@/server/billing";
import { activateByProviderRef } from "@/server/billing/activate";

/**
 * PayMongo platform billing webhook. Marks an invoice paid + activates the
 * subscription after signature verification. (Xendit uses /api/webhooks/xendit.)
 *
 * Configure in PayMongo (platform account): {APP_URL}/api/webhooks/billing
 */
export async function POST(req: NextRequest) {
  const provider = await getBillingProvider();
  if (!provider) return new Response("Not configured", { status: 404 });

  const rawBody = await req.text();
  const signature = req.headers.get("paymongo-signature") ?? "";
  const event = provider.verifyAndParseWebhook(rawBody, signature);
  if (!event) return new Response("Invalid signature", { status: 400 });
  if (event.status !== "paid") return new Response("ok", { status: 200 });

  await activateByProviderRef(event.providerRef, {
    paymentMethodId: event.paymentMethodId,
    customerId: event.customerId,
  });
  return new Response("ok", { status: 200 });
}
