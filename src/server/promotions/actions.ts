"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";

export async function createPromotion(formData: FormData): Promise<void> {
  const staff = await requireStaff(["admin"]);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!title) return;
  await tenantDb(staff.restaurantId, (tx) =>
    tx.promotion.create({
      data: { restaurantId: staff.restaurantId, title, description: description || null },
    }),
  );
  revalidatePath("/admin/promotions");
}

export async function deletePromotion(formData: FormData): Promise<void> {
  const staff = await requireStaff(["admin"]);
  const id = String(formData.get("id") ?? "");
  await tenantDb(staff.restaurantId, (tx) =>
    tx.promotion.deleteMany({ where: { id, restaurantId: staff.restaurantId } }),
  );
  revalidatePath("/admin/promotions");
}

export async function togglePromotion(formData: FormData): Promise<void> {
  const staff = await requireStaff(["admin"]);
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await tenantDb(staff.restaurantId, (tx) =>
    tx.promotion.updateMany({
      where: { id, restaurantId: staff.restaurantId },
      data: { active: !active },
    }),
  );
  revalidatePath("/admin/promotions");
}
