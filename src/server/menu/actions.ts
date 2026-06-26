"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { uploadMenuImage } from "@/server/storage/menu-images";
import { uploadMenuVideo } from "@/server/storage/menu-videos";
import { setDailyLimit } from "@/server/menu/servings";
import { pesosToCentavos } from "@/lib/money";
import { sanitizeTags } from "@/lib/menu/dietary";
import {
  categorySchema,
  menuItemSchema,
  modifierGroupSchema,
  modifierSchema,
} from "@/lib/validation/menu";

/** Shape returned to forms via useActionState. */
export type FormState = { ok?: boolean; error?: string } | null;

/** Turn a ZodError into a single friendly message for the form. */
function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

async function refresh() {
  revalidatePath("/admin/menu");
  revalidatePath("/admin/modifiers");
}

// ---------------------------------------------------------------- categories

export async function createCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  await tenantDb(restaurantId, (tx) =>
    tx.category.create({ data: { restaurantId, ...parsed.data } }),
  );
  await refresh();
  return { ok: true };
}

export async function renameCategory(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await tenantDb(restaurantId, (tx) =>
    tx.category.update({ where: { id }, data: { name } }),
  );
  await refresh();
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  // Cascade removes the category's items (see schema onDelete: Cascade).
  await tenantDb(restaurantId, (tx) =>
    tx.category.delete({ where: { id } }),
  );
  await refresh();
}

// --------------------------------------------------------------------- items

async function resolveImageUrl(
  restaurantId: string,
  formData: FormData,
): Promise<string | undefined> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    return uploadMenuImage(restaurantId, file);
  }
  return undefined;
}

/**
 * Resolves the video change from the form:
 *   removeVideo → null · uploaded file → upload · pasted URL → that URL · else no change.
 * A returned {} means "leave the existing video untouched".
 */
async function resolveVideoUpdate(
  restaurantId: string,
  formData: FormData,
): Promise<{ videoUrl?: string | null }> {
  if (formData.get("removeVideo") === "on") return { videoUrl: null };

  const file = formData.get("video");
  if (file instanceof File && file.size > 0) {
    return { videoUrl: await uploadMenuVideo(restaurantId, file) };
  }
  const url = String(formData.get("videoUrl") ?? "").trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) throw new Error("Video URL must start with http(s)://");
    return { videoUrl: url };
  }
  return {};
}

export async function createItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = menuItemSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    pricePesos: formData.get("pricePesos"),
    isAvailable: formData.get("isAvailable") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  let imageUrl: string | undefined;
  try {
    imageUrl = await resolveImageUrl(restaurantId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image upload failed" };
  }

  const created = await tenantDb(restaurantId, (tx) =>
    tx.menuItem.create({
      data: {
        restaurantId,
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price: pesosToCentavos(parsed.data.pricePesos),
        isAvailable: parsed.data.isAvailable,
        dietaryTags: sanitizeTags(formData.getAll("dietaryTags").map(String)),
        imageUrl,
      },
      select: { id: true },
    }),
  );
  await saveFoodCost(restaurantId, created.id, formData.get("costPesos"));
  await refresh();
  return { ok: true };
}

export async function updateItem(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  const parsed = menuItemSchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    pricePesos: formData.get("pricePesos"),
    isAvailable: formData.get("isAvailable") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  let imageUrl: string | undefined;
  let videoUpdate: { videoUrl?: string | null } = {};
  try {
    imageUrl = await resolveImageUrl(restaurantId, formData);
    videoUpdate = await resolveVideoUpdate(restaurantId, formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }

  await tenantDb(restaurantId, (tx) =>
    tx.menuItem.update({
      where: { id },
      data: {
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        price: pesosToCentavos(parsed.data.pricePesos),
        isAvailable: parsed.data.isAvailable,
        dietaryTags: sanitizeTags(formData.getAll("dietaryTags").map(String)),
        // Only overwrite the image when a new one was uploaded.
        ...(imageUrl ? { imageUrl } : {}),
        ...videoUpdate,
      },
    }),
  );
  await saveFoodCost(restaurantId, id, formData.get("costPesos"));
  await saveDailyLimit(restaurantId, id, formData.get("dailyLimit"));
  await refresh();
  revalidatePath(`/admin/menu/${id}`);
  return { ok: true };
}

/**
 * Persist a menu item's daily servings cap from the form. A blank/zero value
 * clears the cap (unlimited). The field is absent on some forms (null) → leave
 * the existing setting untouched. Best-effort.
 */
async function saveDailyLimit(
  restaurantId: string,
  menuItemId: string,
  raw: FormDataEntryValue | null,
): Promise<void> {
  if (raw == null) return; // field not on this form → don't touch
  const s = String(raw).trim();
  const n = s === "" ? 0 : Math.floor(Number(s));
  const limit = Number.isFinite(n) && n > 0 ? n : null; // 0 / blank / invalid → no cap
  await setDailyLimit(restaurantId, menuItemId, limit);
}

/** Upsert a menu item's food cost (for accounting COGS). Best-effort. */
async function saveFoodCost(restaurantId: string, menuItemId: string, raw: FormDataEntryValue | null): Promise<void> {
  if (raw == null || String(raw).trim() === "") return;
  const cost = pesosToCentavos(Number(raw) || 0);
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.menuItemCost.upsert({
        where: { menuItemId },
        create: { restaurantId, menuItemId, cost },
        update: { cost },
      }),
    );
  } catch {
    /* menu_item_costs table not migrated yet — ignore */
  }
}

/** Out-of-stock toggle, used straight from the menu list. */
export async function toggleItemAvailability(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  const available = formData.get("available") === "true";
  await tenantDb(restaurantId, (tx) =>
    tx.menuItem.update({ where: { id }, data: { isAvailable: available } }),
  );
  await refresh();
}

export async function deleteItem(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, (tx) =>
    tx.menuItem.delete({ where: { id } }),
  );
  await refresh();
}

// --------------------------------------------------------- modifier groups

export async function createModifierGroup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = modifierGroupSchema.safeParse({
    name: formData.get("name"),
    required: formData.get("required") === "on",
    minSelect: formData.get("minSelect") ?? 0,
    maxSelect: formData.get("maxSelect") ?? 1,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  await tenantDb(restaurantId, (tx) =>
    tx.modifierGroup.create({ data: { restaurantId, ...parsed.data } }),
  );
  await refresh();
  return { ok: true };
}

export async function deleteModifierGroup(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, (tx) =>
    tx.modifierGroup.delete({ where: { id } }),
  );
  await refresh();
}

export async function createModifier(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const groupId = String(formData.get("modifierGroupId"));
  const parsed = modifierSchema.safeParse({
    name: formData.get("name"),
    priceDeltaPesos: formData.get("priceDeltaPesos") ?? 0,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  // Verify the group belongs to this tenant before adding an option to it.
  await tenantDb(restaurantId, async (tx) => {
    const group = await tx.modifierGroup.findFirst({ where: { id: groupId } });
    if (!group) throw new Error("Modifier group not found");
    await tx.modifier.create({
      data: {
        modifierGroupId: groupId,
        name: parsed.data.name,
        priceDelta: pesosToCentavos(parsed.data.priceDeltaPesos),
      },
    });
  });
  await refresh();
  return { ok: true };
}

export async function deleteModifier(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  // RLS via the modifiers->modifier_groups policy ensures cross-tenant deletes fail.
  await tenantDb(restaurantId, (tx) =>
    tx.modifier.delete({ where: { id } }),
  );
  await refresh();
}

// ------------------------------------------------ attach groups to an item

export async function setItemModifierGroup(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const menuItemId = String(formData.get("menuItemId"));
  const modifierGroupId = String(formData.get("modifierGroupId"));
  const attach = formData.get("attach") === "true";

  await tenantDb(restaurantId, async (tx) => {
    // Confirm both rows belong to this tenant (RLS already enforces it, but we
    // fail clearly rather than silently no-op).
    const item = await tx.menuItem.findFirst({ where: { id: menuItemId } });
    const group = await tx.modifierGroup.findFirst({
      where: { id: modifierGroupId },
    });
    if (!item || !group) throw new Error("Not found");

    if (attach) {
      await tx.menuItemModifierGroup.upsert({
        where: { menuItemId_modifierGroupId: { menuItemId, modifierGroupId } },
        update: {},
        create: { menuItemId, modifierGroupId },
      });
    } else {
      await tx.menuItemModifierGroup.delete({
        where: { menuItemId_modifierGroupId: { menuItemId, modifierGroupId } },
      });
    }
  });
  revalidatePath(`/admin/menu/${menuItemId}`);
}
