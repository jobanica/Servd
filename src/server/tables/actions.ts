"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";

export type FormState = { ok?: boolean; error?: string } | null;

/** 32 hex chars — non-guessable so a diner can't enumerate other tables. */
function newQrToken(): string {
  return randomBytes(16).toString("hex");
}

const tableSchema = z.object({
  tableNumber: z.string().trim().min(1, "Table label is required").max(40),
});

export async function createTable(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = tableSchema.safeParse({
    tableNumber: formData.get("tableNumber"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.table.create({
        data: {
          restaurantId,
          tableNumber: parsed.data.tableNumber,
          qrToken: newQrToken(),
        },
      }),
    );
  } catch {
    // Unique constraint on (restaurantId, tableNumber).
    return { error: "A table with that label already exists." };
  }

  revalidatePath("/admin/tables");
  return { ok: true };
}

export async function deleteTable(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, (tx) => tx.table.delete({ where: { id } }));
  revalidatePath("/admin/tables");
}

/**
 * Issues a fresh QR token for a table — use if a printed code leaks or you want
 * to retire old prints. The old URL stops working immediately.
 */
export async function regenerateQrToken(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, (tx) =>
    tx.table.update({ where: { id }, data: { qrToken: newQrToken() } }),
  );
  revalidatePath("/admin/tables");
}
