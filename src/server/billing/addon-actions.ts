"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { getBillingProvider } from "@/server/billing";
import {
  CUSTOM_DOMAIN_ADDON,
  CUSTOM_DOMAIN_PRICE,
  getCustomDomainAccess,
} from "@/server/billing/addons";

export type UnlockResult = { checkoutUrl: string } | { error: string };

export type VerifyResult = { unlocked: true } | { unlocked: false; message: string };

/**
 * "I've already paid" — ask the gateway directly what happened to the pending
 * checkout, and settle it if it's paid. The webhook is still the normal path;
 * this is the safety net for when it never arrives (misconfigured endpoint,
 * gateway downtime), so a paying customer is never left locked out.
 */
export async function verifyCustomDomainUnlock(): Promise<VerifyResult> {
  const { restaurantId } = await requireAdminAction();

  const access = await getCustomDomainAccess(restaurantId);
  if (access.allowed) return { unlocked: true };

  let pending: { id: string; providerRef: string | null } | null = null;
  try {
    pending = await tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.findFirst({
        where: { restaurantId, addon: CUSTOM_DOMAIN_ADDON, status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true, providerRef: true },
      }),
    );
  } catch {
    return { unlocked: false, message: "Couldn't check right now. Please try again." };
  }
  if (!pending?.providerRef) {
    return { unlocked: false, message: "We couldn't find a payment to check. Start the unlock below." };
  }

  const provider = await getBillingProvider();
  if (!provider?.getCheckoutStatus) {
    return { unlocked: false, message: "We couldn't verify automatically. Please contact support." };
  }

  let status: "paid" | "pending" | "failed";
  try {
    status = await provider.getCheckoutStatus(pending.providerRef);
  } catch {
    return { unlocked: false, message: "Couldn't reach the payment provider. Please try again shortly." };
  }
  if (status !== "paid") {
    return {
      unlocked: false,
      message:
        status === "failed"
          ? "That payment didn't go through. Please start the unlock again."
          : "We can't see your payment yet. If you've just paid, wait a moment and check again.",
    };
  }

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.update({
        where: { id: pending.id },
        data: { status: "paid", paidAt: new Date() },
      }),
    );
  } catch {
    return { unlocked: false, message: "Couldn't apply the unlock. Please contact support." };
  }
  revalidatePath("/admin/domains");
  return { unlocked: true };
}

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
