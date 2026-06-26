"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { uniqueSlug } from "@/lib/slug";
import { pesosToCentavos } from "@/lib/money";
import { getTopPlan } from "@/server/billing/subscription";
import { COMP_FOREVER } from "@/lib/billing/comp";

export type FormState = { ok?: boolean; error?: string } | null;

const PATH = "/super-admin/storefronts";
const detailPath = (id: string) => `${PATH}/${id}`;

function receiptJson(address: string, phone: string) {
  return { receipt: { address: address || "", phone: phone || "" } };
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(80),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(400).optional().or(z.literal("")),
});

/**
 * Create a DEMO online-ordering storefront for a prospect — a real tenant with
 * a live /r/{slug} page, but NO login account. We give it a complimentary
 * (open-ended) trial so the online-ordering feature is unlocked indefinitely
 * until you convert or delete it. Foot-in-the-door: show them they already have
 * a commission-free ordering system.
 */
export async function createDemoStorefront(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    tagline: formData.get("tagline") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  let id: string;
  try {
    id = await systemDb(async (tx) => {
      const slug = await uniqueSlug(
        d.name,
        async (s) => !!(await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } })),
      );
      const r = await tx.restaurant.create({
        data: {
          name: d.name,
          displayName: d.name,
          slug,
          status: "active",
          logoUrl: d.logoUrl || null,
          tagline: d.tagline || null,
          // Storefront contact reads from printerConfig.receipt (no extra column).
          printerConfig: receiptJson(d.address ?? "", d.phone ?? ""),
        },
        select: { id: true },
      });
      // Complimentary open-ended trial → onlineOrdering stays unlocked.
      const plan = await getTopPlan(tx);
      if (plan) {
        await tx.restaurant.update({ where: { id: r.id }, data: { planId: plan.id }, select: { id: true } });
        await tx.subscription.create({
          data: {
            restaurantId: r.id,
            planId: plan.id,
            status: "trialing",
            trialEndsAt: COMP_FOREVER,
            currentPeriodEnd: COMP_FOREVER,
          },
          select: { id: true },
        });
      }
      return r.id;
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the storefront." };
  }
  revalidatePath(PATH);
  redirect(detailPath(id));
}

/** Update the demo's business details (name, tagline, logo, contact). */
export async function updateDemoDetails(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  await systemDb((tx) =>
    tx.restaurant.update({
      where: { id },
      data: {
        ...(name ? { name, displayName: name } : {}),
        tagline: tagline || null,
        logoUrl: logoUrl || null,
        printerConfig: receiptJson(address, phone),
      },
      select: { id: true },
    }),
  );
  revalidatePath(detailPath(id));
}

export async function addCategory(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await systemDb((tx) => tx.category.create({ data: { restaurantId, name }, select: { id: true } }));
  revalidatePath(detailPath(restaurantId));
}

export async function deleteCategory(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.category.delete({ where: { id } }));
  revalidatePath(detailPath(restaurantId));
}

export async function addItem(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const categoryId = String(formData.get("categoryId"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !categoryId) return;
  const price = pesosToCentavos(Number(formData.get("price") ?? 0));
  const description = String(formData.get("description") ?? "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  await systemDb((tx) =>
    tx.menuItem.create({
      data: { restaurantId, categoryId, name, price, description, imageUrl },
      select: { id: true },
    }),
  );
  revalidatePath(detailPath(restaurantId));
}

export async function deleteItem(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.menuItem.delete({ where: { id } }));
  revalidatePath(detailPath(restaurantId));
}

export async function toggleItem(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  const available = formData.get("available") === "true";
  await systemDb((tx) =>
    tx.menuItem.update({ where: { id }, data: { isAvailable: available }, select: { id: true } }),
  );
  revalidatePath(detailPath(restaurantId));
}

/** Delete the demo storefront entirely (cascades menu + subscription). */
export async function deleteDemoStorefront(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.restaurant.delete({ where: { id } }));
  revalidatePath(PATH);
  redirect(PATH);
}
