"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/server/tenancy/current-user";

/**
 * Staff/admin/super-admin sign-in. Supabase verifies the password (stored
 * hashed in auth.users) and sets the session cookie. We then route the user to
 * the right home screen based on their Servd role.
 */
export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "No Servd account is linked to this login." };
  }

  if (user.kind === "super") redirect("/super-admin");
  if (user.role === "kitchen") redirect("/kitchen");
  if (user.role === "cashier") redirect("/cashier");
  if (user.role === "manager") redirect("/admin/hr");
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Sends a password-reset email. Always reports success (no account enumeration). */
export async function requestPasswordReset(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };
  const supabase = await createSupabaseServerClient();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${base}/reset-password` });
  } catch {
    /* ignore — still report success */
  }
  return { ok: true };
}
