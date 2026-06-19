import { NextRequest } from "next/server";
import { getRestaurantGateway } from "@/server/payments/credentials";
import { applyPaymentWebhook } from "@/server/payments/apply-webhook";

/**
 * Xendit payment webhook — the authoritative source of payment truth.
 *
 * Xendit authenticates callbacks with the `x-callback-token` header (the
 * restaurant's webhook verification token), which we compare in constant time.
 * The client is never trusted to confirm payment.
 *
 * Configure each restaurant's Xendit webhook (Invoices paid/expired) to:
 *   {APP_URL}/api/webhooks/xendit/{restaurantId}
 *
 * Returns 200 for handled/ignored events; 400 only for an invalid token.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const rawBody = await req.text();
  const callbackToken = req.headers.get("x-callback-token") ?? "";

  const gateway = await getRestaurantGateway(restaurantId);
  if (!gateway) return new Response("Not configured", { status: 404 });

  const event = gateway.verifyAndParseWebhook(rawBody, callbackToken);
  if (!event) return new Response("Invalid token", { status: 400 });

  await applyPaymentWebhook(restaurantId, event);
  return new Response("ok", { status: 200 });
}
