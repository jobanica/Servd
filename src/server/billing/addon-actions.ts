"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { getBillingProvider } from "@/server/billing";
import {
  CUSTOM_DOMAIN_ADDON,
  CUSTOM_DOMAIN_PRICE,
  getCustomDomainAccess,
} from "@/server/billing/addons";

export type UnlockResult = { checkoutUrl: string } | { error: string };

/**
 * Start a hosted checkout for the one-time custom-domain unlock. Mirrors the
 * subscription flow: we only ever create the pending purchase + checkout here —
 * access is granted by the signature-verified webhook, never by this action.
 */
export async function startCustomDomainUnlock(): Promise<UnlockResult> {
  const { restaurantId } = await requireAdminAction();

  const access = await getCustomDomainAccess(restaurantId);
  if (access.allowed) return { error: "Custom domains are already unlocked for this account." };

  const provider = await getBillingProvider();
  if (!provider) return { error: "Payments aren't configured on the platform yet." };

  // Reuse an unpaid attempt so repeated clicks don't pile up rows.
  let purchaseId: string;
  try {
    purchaseId = await tenantDb(restaurantId, async (tx) => {
      const existing = await tx.addonPurchase.findFirst({
        where: { restaurantId, addon: CUSTOM_DOMAIN_ADDON, status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (existing) return existing.id;
      const created = await tx.addonPurchase.create({
        data: {
          restaurantId,
          addon: CUSTOM_DOMAIN_ADDON,
          amount: CUSTOM_DOMAIN_PRICE,
          status: "pending",
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch {
    return { error: "Couldn't start the purchase. Please try again." };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let checkout;
  try {
    checkout = await provider.createInvoiceCheckout({
      amount: CUSTOM_DOMAIN_PRICE,
      description: "Servd custom domain — one-time unlock",
      // Prefixed so it's obvious in the gateway dashboard this isn't a subscription.
      referenceNumber: `dom-${purchaseId.slice(0, 12)}`,
      successUrl: `${base}/admin/domains?unlocked=1`,
    });
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.update({ where: { id: purchaseId }, data: { providerRef: checkout.gatewayRef } }),
    );
  } catch {
    return { error: "Couldn't start checkout. Please try again." };
  }

  return { checkoutUrl: checkout.checkoutUrl };
}
