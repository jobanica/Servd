"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uploadMenuImage } from "@/server/storage/menu-images";
import { provisionDemo, receiptJson } from "./provision";
import { scanAndSaveMenu } from "./scan-save";

export type FormState = { ok?: boolean; error?: string } | null;

const LOGIN_DOMAIN = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";
function syntheticEmail(username: string): string {
  return `${username}@${LOGIN_DOMAIN}`;
}
function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out;
}

const PATH = "/super-admin/storefronts";
const detailPath = (id: string) => `${PATH}/${id}`;

const createSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(80),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  tagline: z.string().trim().max(120).optional().or(z.literal("")),
  logoUrl: z.string().trim().max(400).optional().or(z.literal("")),
});

/**
 * Create a DEMO online-ordering storefront for a prospect — a real tenant with
 * a live /r/{slug} page, but NO login account. Foot-in-the-door: show them they
 * already have a commission-free ordering system.
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
    id = await provisionDemo({
      name: d.name,
      address: d.address ?? "",
      phone: d.phone ?? "",
      tagline: d.tagline ?? "",
      logoUrl: d.logoUrl ?? "",
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't create the storefront." };
  }
  revalidatePath(PATH);
  redirect(detailPath(id));
}

/** One-click: build a demo storefront pre-filled from a CRM client's details. */
export async function createDemoFromClient(clientId: string): Promise<void> {
  await requireSuperAdmin();
  const base = await systemDb((tx) =>
    tx.crmClient.findUnique({ where: { id: clientId }, select: { name: true, phone: true } }),
  );
  if (!base) return;
  // address column is best-effort (later migration).
  let address = "";
  try {
    const a = await systemDb((tx) =>
      tx.crmClient.findUnique({ where: { id: clientId }, select: { address: true } }),
    );
    address = a?.address ?? "";
  } catch {
    /* address column not migrated yet */
  }
  const id = await provisionDemo({ name: base.name, address, phone: base.phone ?? "", tagline: "", logoUrl: "" });
  // Link the demo back to the client so the pipeline shows "demo ready".
  try {
    await systemDb((tx) =>
      tx.crmClient.update({ where: { id: clientId }, data: { demoRestaurantId: id }, select: { id: true } }),
    );
  } catch {
    /* demoRestaurantId column not migrated yet — ignore */
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
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  // Logo: an uploaded file wins over the pasted URL. Blank both → leave as-is.
  let logoUpdate: { logoUrl?: string | null } = {};
  const logoFile = formData.get("logo");
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  if (logoFile instanceof File && logoFile.size > 0) {
    logoUpdate = { logoUrl: await uploadMenuImage(id, logoFile) };
  } else if (formData.has("logoUrl")) {
    logoUpdate = { logoUrl: logoUrl || null };
  }

  await systemDb((tx) =>
    tx.restaurant.update({
      where: { id },
      data: {
        ...(name ? { name, displayName: name } : {}),
        tagline: tagline || null,
        ...logoUpdate,
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
  let imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  // Optional uploaded photo wins over a pasted URL.
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    try {
      imageUrl = await uploadMenuImage(restaurantId, image);
    } catch {
      /* keep any pasted URL on upload failure */
    }
  }
  await systemDb((tx) =>
    tx.menuItem.create({
      data: { restaurantId, categoryId, name, price, description, imageUrl },
      select: { id: true },
    }),
  );
  revalidatePath(detailPath(restaurantId));
}

/** Replace an existing item's photo from an uploaded file. */
export async function uploadItemPhoto(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return;
  let imageUrl: string;
  try {
    imageUrl = await uploadMenuImage(restaurantId, image);
  } catch {
    return;
  }
  await systemDb((tx) => tx.menuItem.update({ where: { id }, data: { imageUrl }, select: { id: true } }));
  revalidatePath(detailPath(restaurantId));
}

/**
 * Set an existing item's photo from a pasted image address (URL) — no download
 * needed. Demo-storefront only. A blank URL clears the photo.
 */
export async function setItemPhotoUrl(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const id = String(formData.get("id"));
  const raw = String(formData.get("imageUrl") ?? "").trim();
  // Only accept http(s) image addresses (or blank to clear).
  if (raw && !/^https?:\/\//i.test(raw)) return;
  await systemDb((tx) => tx.menuItem.update({ where: { id }, data: { imageUrl: raw || null }, select: { id: true } }));
  revalidatePath(detailPath(restaurantId));
}

export type ScanState = { ok?: boolean; added?: number; error?: string } | null;

/**
 * AI menu scan: upload menu photo(s), let Claude read them, and append the
 * detected categories + items to the demo storefront's menu.
 */
export async function scanDemoMenu(_prev: ScanState, formData: FormData): Promise<ScanState> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const res = await scanAndSaveMenu(restaurantId, files);
  if (!res.ok) return { error: res.error };
  revalidatePath(detailPath(restaurantId));
  return { ok: true, added: res.added };
}

export type ConvertState =
  | { ok?: boolean; error?: string; credentials?: { username: string; password: string } }
  | null;

const convertSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-z0-9._-]+$/, "Letters, numbers, dot, dash, underscore"),
});

/**
 * Convert a demo storefront into a REAL account: attach a username login to the
 * existing tenant (keeping its menu), and start a fresh 30-day Business trial.
 * Returns the credentials to hand the owner.
 */
export async function convertDemoToAccount(_prev: ConvertState, formData: FormData): Promise<ConvertState> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const parsed = convertSchema.safeParse({ username: formData.get("username") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid username" };
  const username = parsed.data.username;

  const info = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { id: restaurantId }, select: { id: true, _count: { select: { staff: true } } } }),
  );
  if (!info) return { error: "Storefront not found." };
  if (info._count.staff > 0) return { error: "This storefront already has a login." };

  const taken = await systemDb((tx) => tx.staffUser.findFirst({ where: { username }, select: { id: true } }));
  if (taken) return { error: "That username is already taken." };

  const password = tempPassword();
  const email = syntheticEmail(username);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    return { error: /registered|exists/i.test(error?.message ?? "") ? "That username is taken." : error?.message ?? "Couldn't create the login." };
  }
  const authUserId = data.user.id;

  try {
    await systemDb(async (tx) => {
      await tx.staffUser.create({
        data: { restaurantId, authUserId, role: "admin", email, username },
        select: { id: true },
      });
      // Fresh 30-day Business trial — the countdown starts now.
      const sub = await tx.subscription.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);
      if (sub) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: "trialing", trialEndsAt, currentPeriodEnd: trialEndsAt },
          select: { id: true },
        });
      }
    });
  } catch (e) {
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Couldn't convert.";
    return { error: /unique/i.test(msg) ? "That username is taken." : msg };
  }
  revalidatePath(detailPath(restaurantId));
  revalidatePath(PATH);
  revalidatePath("/super-admin/accounts");
  return { ok: true, credentials: { username, password } };
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
