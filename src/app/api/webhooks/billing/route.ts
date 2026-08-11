import { NextRequest } from "next/server";
import { getBillingProvider } from "@/server/billing";
import { activateByProviderRef } from "@/server/billing/activate";
import { markAddonPaidByProviderRef } from "@/server/billing/addons";
import { activateFeatureSubByProviderRef } from "@/server/billing/feature-subscriptions";
import { systemDb } from "@/server/tenancy/scoped-db";
import { clawbackByInvoiceProviderRef } from "@/server/referrals/accrual";

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

  // Refund → reverse referral rewards tied to that invoice (within window).
  if (event.status === "refunded") {
    await systemDb((tx) => clawbackByInvoiceProviderRef(tx, event.providerRef, "refund"));
    return new Response("ok", { status: 200 });
  }

  if (event.status !== "paid") return new Response("ok", { status: 200 });

  // A monthly per-feature subscription (e.g. the content scheduler) — activate
  // that feature only, never the main plan.
  if (await activateFeatureSubByProviderRef(event.providerRef)) {
    return new Response("ok", { status: 200 });
  }

  // One-time add-on (e.g. the custom-domain unlock) — grant it and stop, so it
  // never activates or extends a subscription.
  if (await markAddonPaidByProviderRef(event.providerRef)) {
    return new Response("ok", { status: 200 });
  }

  await activateByProviderRef(event.providerRef, {
    paymentMethodId: event.paymentMethodId,
    customerId: event.customerId,
  });
  return new Response("ok", { status: 200 });
}
