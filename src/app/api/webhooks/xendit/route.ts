import { NextRequest } from "next/server";
import { getPlatformBilling } from "@/server/billing/platform-settings";
import { XenditBillingProvider } from "@/server/billing/xendit";
import { activateByProviderRef } from "@/server/billing/activate";
import { markAddonPaidByProviderRef } from "@/server/billing/addons";

/**
 * Xendit platform billing webhook — fires when a subscriber pays their
 * subscription invoice. Verifies Xendit's x-callback-token, then marks the
 * invoice paid and ACTIVATES the subscription (the system turns back on
 * automatically). Configure in the Xendit dashboard:
 *   Settings → Webhooks → Invoices paid → {APP_URL}/api/webhooks/xendit
 */
export async function POST(req: NextRequest) {
  const billing = await getPlatformBilling();
  if (!billing.xendit?.secretKey) return new Response("Not configured", { status: 404 });

  const rawBody = await req.text();
  const token = req.headers.get("x-callback-token") ?? "";
  const provider = new XenditBillingProvider(billing.xendit.secretKey, billing.xendit.callbackToken);
  const event = provider.verifyAndParseWebhook(rawBody, token);
  if (!event) return new Response("Invalid token", { status: 401 });
  if (event.status !== "paid") return new Response("ok", { status: 200 });

  // One-time add-on (e.g. the custom-domain unlock) — grant it and stop, so it
  // never activates or extends a subscription.
  if (await markAddonPaidByProviderRef(event.providerRef)) {
    return new Response("ok", { status: 200 });
  }

  await activateByProviderRef(event.providerRef);
  return new Response("ok", { status: 200 });
}
