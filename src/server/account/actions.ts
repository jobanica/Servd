"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";

export type AccountState = { ok?: boolean; message?: string; error?: string } | null;

/** Change the login email (Supabase sends a confirmation to the new address). */
export async function updateEmail(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the new email." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { error: error.message };
  return { ok: true, message: "Check your new inbox to confirm the change." };
}

/** Change the login password. */
export async function updatePassword(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true, message: "Password updated." };
}

/** Change the restaurant's contact phone (shown on receipts + the website). */
export async function updatePhone(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const { restaurantId } = await requireAdminAction();
  const phone = String(formData.get("phone") ?? "").trim();
  try {
    await tenantDb(restaurantId, async (tx) => {
      const r = await tx.restaurant.findFirstOrThrow({ select: { printerConfig: true } });
      const cfg = (r.printerConfig as Record<string, unknown> | null) ?? {};
      const receipt = (cfg.receipt as Record<string, unknown> | null) ?? {};
      cfg.receipt = { ...receipt, phone: phone || null };
      await tx.restaurant.update({ where: { id: restaurantId }, data: { printerConfig: cfg as object } });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't update phone." };
  }
  revalidatePath("/admin/account");
  return { ok: true, message: "Contact phone updated." };
}
