"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { getCustomDomainAccess } from "@/server/billing/addons";
import { getDomainProvider } from "@/server/domains";

export type FormState = { ok?: boolean; error?: string } | null;

/**
 * Custom domains need a PAID Growth/Business plan or the one-time ₱500 unlock —
 * a trial doesn't grant them. Enforced here so the gate can't be bypassed by
 * posting straight to the action.
 */
async function ensureModule(restaurantId: string) {
  const access = await getCustomDomainAccess(restaurantId);
  if (!access.allowed) {
    throw new Error("Custom domains are locked. Upgrade to Growth or buy the one-time unlock.");
  }
}

const subdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "Use 3–40 letters, numbers or hyphens");

export async function setSubdomain(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  try {
    await ensureModule(restaurantId);
    const sub = subdomainSchema.parse(formData.get("subdomain"));
    if (["www", "app", "admin", "api"].includes(sub)) {
      return { error: "That subdomain is reserved." };
    }
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({ where: { id: restaurantId }, data: { subdomain: sub } }),
    );
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid subdomain" };
    // Unique-constraint or module error.
    const msg = e instanceof Error ? e.message : "Couldn't save subdomain";
    return { error: msg.includes("Unique") ? "That subdomain is taken." : msg };
  }
  revalidatePath("/admin/domains");
  return { ok: true };
}

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a valid domain like order.mybistro.com");

export async function connectCustomDomain(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  try {
    await ensureModule(restaurantId);
    const domain = domainSchema.parse(formData.get("domain"));
    const provider = getDomainProvider();
    if (!provider) return { error: "Domain connection isn't configured on the platform yet." };

    const res = await provider.addDomain(domain);
    if (!res.ok) return { error: res.error ?? "Vercel rejected the domain." };

    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({
        where: { id: restaurantId },
        data: { customDomain: domain, customDomainVerifiedAt: null },
      }),
    );
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid domain" };
    const msg = e instanceof Error ? e.message : "Couldn't connect domain";
    return { error: msg.includes("Unique") ? "That domain is already connected." : msg };
  }
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function refreshDomainStatus(): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const provider = getDomainProvider();
  if (!provider) return;
  const r = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { customDomain: true } }),
  );
  if (!r.customDomain) return;
  const status = await provider.getStatus(r.customDomain);
  if (status?.verified) {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.update({
        where: { id: restaurantId },
        data: { customDomainVerifiedAt: new Date() },
      }),
    );
  }
  revalidatePath("/admin/domains");
}

export async function removeCustomDomain(): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const provider = getDomainProvider();
  const r = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { customDomain: true } }),
  );
  if (r.customDomain && provider) await provider.removeDomain(r.customDomain);
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: { customDomain: null, customDomainVerifiedAt: null },
    }),
  );
  revalidatePath("/admin/domains");
}
