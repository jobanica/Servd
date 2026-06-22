"use server";

import { z } from "zod";
import { systemDb } from "@/server/tenancy/scoped-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Owner claim flow. A super-admin creates a business with just its name + a
 * one-time claim token (no login). The owner opens /claim/<token> and sets their
 * own email + password here — which provisions their admin login and consumes
 * the token. Public action (no session yet), authorised purely by the token.
 */

export type ClaimState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  token: z.string().trim().min(10),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/** Look up an unclaimed business by token — for rendering the claim page. */
export async function getClaimableBusiness(token: string): Promise<{ name: string } | null> {
  if (!token) return null;
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({
        where: { claimToken: token, claimedAt: null },
        select: { displayName: true, name: true },
      }),
    );
    return r ? { name: r.displayName || r.name } : null;
  } catch {
    return null;
  }
}

export async function claimBusiness(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { token, email, password } = parsed.data;

  // Token must still be unclaimed.
  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { claimToken: token, claimedAt: null }, select: { id: true } }),
  );
  if (!restaurant) return { error: "This setup link is invalid or has already been used." };

  // Create the owner's auth login (email pre-confirmed → can sign in right away).
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    return {
      error: /registered|exists/i.test(error?.message ?? "")
        ? "That email already has an account. Use a different email."
        : error?.message ?? "Couldn't create your login.",
    };
  }
  const authUserId = data.user.id;

  try {
    await systemDb(async (tx) => {
      // Re-check inside the transaction (guards against a double-claim race).
      const fresh = await tx.restaurant.findFirst({
        where: { id: restaurant.id, claimToken: token, claimedAt: null },
        select: { id: true },
      });
      if (!fresh) throw new Error("ALREADY_CLAIMED");
      await tx.staffUser.create({ data: { restaurantId: restaurant.id, authUserId, role: "admin", email } });
      await tx.restaurant.update({
        where: { id: restaurant.id },
        data: { claimToken: null, claimedAt: new Date() },
      });
    });
  } catch (e) {
    // Roll back the orphaned auth user so the email can be reused.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "";
    return {
      error: msg === "ALREADY_CLAIMED" ? "This business was just claimed by someone else." : "Couldn't finish setup. Please try again.",
    };
  }

  return { ok: true };
}
