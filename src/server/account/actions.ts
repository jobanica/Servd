"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";

export type AccountState = { ok?: boolean; message?: string; error?: string } | null;

/**
 * Change the login email. Applied instantly (pre-confirmed via the admin client,
 * matching how accounts are provisioned) and kept in sync with the StaffUser
 * record so the dashboard shows the right address. No confirmation round-trip.
 */
export async function updateEmail(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") return { error: "Please sign in again." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  if (email === user.email.toLowerCase()) return { ok: true, message: "That's already your email." };

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.authUserId, { email, email_confirm: true });
  if (error) {
    return {
      error: /registered|exists|already/i.test(error.message)
        ? "That email is already in use by another account."
        : error.message,
    };
  }

  // Keep our own record in sync (the app shows email from StaffUser).
  try {
    await tenantDb(user.restaurantId, (tx) =>
      tx.staffUser.update({ where: { id: user.staffUserId }, data: { email } }),
    );
  } catch {
    /* auth email already changed; record sync is best-effort */
  }
  revalidatePath("/admin/account");
  return { ok: true, message: "Login email updated." };
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
