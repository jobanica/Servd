"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getCurrentPartner } from "@/server/partners/auth";
import { provisionDemo } from "@/server/storefront-demo/provision";
import { scanAndSaveMenu } from "@/server/storefront-demo/scan-save";

const PATH = "/partner";

export type DemoFormState = { ok?: boolean; error?: string } | null;
export type DemoScanState = { ok?: boolean; added?: number; error?: string } | null;

/** Only an APPROVED partner may create/manage demo storefronts. */
async function requireApprovedPartner() {
  const p = await getCurrentPartner();
  if (!p || p.status !== "approved") throw new Error("UNAUTHORIZED");
  return p;
}

/** Confirm a demo belongs to this partner before mutating it. */
async function ownDemo(restaurantId: string, partnerId: string): Promise<boolean> {
  const hit = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { id: restaurantId, demoPartnerId: partnerId }, select: { id: true } }),
  );
  return !!hit;
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(80),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(400).optional().or(z.literal("")),
});

/**
 * Partner creates a DEMO storefront for a prospect — a live /r/{slug} ordering
 * page with no login, tagged to the partner. Foot-in-the-door for pitching.
 */
export async function createPartnerDemo(_prev: DemoFormState, formData: FormData): Promise<DemoFormState> {
  let partner;
  try {
    partner = await requireApprovedPartner();
  } catch {
    return { error: "Your partner account isn't approved yet." };
  }
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline") ?? "",
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  try {
    await provisionDemo({
      name: d.name,
      tagline: d.tagline ?? "",
      address: d.address ?? "",
      phone: d.phone ?? "",
      logoUrl: d.logoUrl ?? "",
      demoPartnerId: partner.id,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the storefront." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Partner: AI-scan a menu photo/PDF into one of their demo storefronts. */
export async function scanPartnerDemoMenu(_prev: DemoScanState, formData: FormData): Promise<DemoScanState> {
  let partner;
  try {
    partner = await requireApprovedPartner();
  } catch {
    return { error: "Your partner account isn't approved yet." };
  }
  const restaurantId = String(formData.get("restaurantId") ?? "");
  if (!(await ownDemo(restaurantId, partner.id))) return { error: "Storefront not found." };

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const res = await scanAndSaveMenu(restaurantId, files);
  if (!res.ok) return { error: res.error };
  revalidatePath(PATH);
  return { ok: true, added: res.added };
}

/** Partner: delete one of their own demo storefronts. */
export async function deletePartnerDemo(formData: FormData): Promise<void> {
  const partner = await requireApprovedPartner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Ownership enforced in the where clause — a partner can't delete another's.
  await systemDb((tx) =>
    tx.restaurant.deleteMany({ where: { id, demoPartnerId: partner.id } }),
  );
  revalidatePath(PATH);
}
