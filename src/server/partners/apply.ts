"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { encryptJson } from "@/lib/crypto/secrets";

export type ApplyState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  name: z.string().trim().min(2, "Your name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  tier: z.enum(["affiliate", "reseller"]).default("affiliate"),
  payoutMethod: z.enum(["gcash", "bank"]).default("gcash"),
  payoutDetails: z.string().trim().min(2, "Enter your payout details").max(300),
  taxInfo: z.string().trim().max(120).optional().or(z.literal("")),
});

/**
 * Affiliate/reseller partner application. Creates a Supabase auth user (so the
 * partner can log into the portal once approved) and a `pending` partner row.
 * Payout + tax details are encrypted at rest. Super-admin approves before any
 * referral code is issued.
 */
export async function applyAsPartner(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    tier: formData.get("tier") ?? "affiliate",
    payoutMethod: formData.get("payoutMethod") ?? "gcash",
    payoutDetails: formData.get("payoutDetails"),
    taxInfo: formData.get("taxInfo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;

  try {
    const supabase = await createSupabaseServerClient();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { emailRedirectTo: `${base.replace(/\/$/, "")}/partner/login` },
    });
    if (error) return { error: error.message };
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      return { error: "That email is already registered. Try logging in." };
    }
    const authUserId = data.user.id;

    try {
      await systemDb((tx) =>
        tx.partner.create({
          data: {
            authUserId,
            name: v.name,
            email: v.email,
            tier: v.tier,
            status: "pending",
            payoutMethod: v.payoutMethod,
            payoutDetailsEnc: encryptJson({ details: v.payoutDetails }),
            taxInfoEnc: v.taxInfo ? encryptJson({ tax: v.taxInfo }) : null,
          },
        }),
      );
    } catch (e) {
      // Roll back the orphan auth user so the email can be reused.
      try {
        await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
      } catch {
        /* ignore cleanup failure */
      }
      const msg = e instanceof Error && /Unique|email/i.test(e.message)
        ? "An application with that email already exists."
        : "Couldn't submit your application. Please try again.";
      return { error: msg };
    }

    return { ok: true };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
