"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { uniqueSlug } from "@/lib/slug";
import { provisionTrial } from "@/server/billing/subscription";
import { cookies } from "next/headers";
import { REF_COOKIE, normalizeReferralCode } from "@/lib/agent-kit/ref";
import { lookupAgentCode } from "@/lib/agent-kit/client";
import { portalRefusedCode } from "@/lib/agent-portal/referral";
import { portalConfig } from "@/server/agent-portal/config";
import { enqueueCustomerSignedUp } from "@/server/agent-portal/events";
import { rateLimit } from "@/server/build/rate-limit";

export type SignupState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  restaurantName: z.string().trim().min(2, "Restaurant name is required").max(80),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Public self-serve restaurant signup. Creates the Supabase Auth user (which
 * triggers the confirmation email) and provisions the tenant + first owner.
 *
 * The restaurant starts NOT LIVE (`pending`): the owner can sign in and set up
 * the menu straight away, but the ordering page and QR ordering stay off until
 * they activate — sign the agreement, pay by QR, upload the receipt — and
 * CANVEXIA confirms the payment. Every signup is billed through the agent
 * portal; an agent's code, if there is one, only decides who earns commission.
 */
export async function signUpRestaurant(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = schema.safeParse({
    restaurantName: formData.get("restaurantName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { restaurantName, phone, email, password } = parsed.data;

  // The portal records every customer by name and phone, agent or not.
  const ownerName = String(formData.get("ownerName") ?? "").trim().slice(0, 120);
  if (!ownerName) return { error: "Enter your name." };
  // A CANVEXIA sales agent's code, if there is one — optional.
  let agentCode = normalizeReferralCode(String(formData.get("referralCode") ?? ""));
  if (agentCode) agentCode = await keepUnlessRefused(agentCode);

  const limited = await rateLimit("signup:create");
  if (!limited.ok) return { error: limited.error ?? "Please try again later." };

  try {
    const supabase = await createSupabaseServerClient();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${base.replace(/\/$/, "")}/login` },
    });
    if (error) return { error: error.message };

    // Supabase obfuscates "already registered": a user with no identities.
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      return { error: "That email is already registered. Try logging in." };
    }
    const authUserId = data.user.id;

    try {
      await systemDb(async (tx) => {
        const slug = await uniqueSlug(restaurantName, async (s) => {
          const hit = await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } });
          return !!hit;
        });
        const restaurant = await tx.restaurant.create({
          data: {
            name: restaurantName,
            displayName: restaurantName,
            slug,
            // Not live until the activation payment is confirmed.
            status: "pending",
            // Seed the contact phone — it also shows on printed receipts.
            printerConfig: { receipt: { phone } },
            staff: { create: { authUserId, role: "admin", email } },
          },
          select: { id: true },
        });
        // 30-day Business trial — every feature unlocked, no card.
        await provisionTrial(tx, restaurant.id);
        // In the SAME transaction as the restaurant: the portal-billing row
        // and the customer.signed_up event commit with it or not at all. The
        // portal is not called here — the worker delivers the event.
        await tx.agentAccount.create({
          data: { restaurantId: restaurant.id, agentCode, ownerName, ownerPhone: phone },
          select: { restaurantId: true },
        });
        await enqueueCustomerSignedUp(tx, restaurant.id);
      });
    } catch (e) {
      console.error("[signup] provisioning failed:", e);
      // Roll back the orphaned auth user so the email can be reused on retry.
      try {
        await createSupabaseAdminClient().auth.admin.deleteUser(authUserId);
      } catch (cleanup) {
        console.error("[signup] orphan cleanup failed:", cleanup);
      }
      return { error: "Couldn't create your restaurant. Please try again." };
    }

    // Recorded — forget the agent cookie.
    try {
      (await cookies()).delete(REF_COOKIE);
    } catch { /* cookie clearing is cosmetic */ }
    return { ok: true };
  } catch (e) {
    // Never let the action crash into a 500 page — surface a friendly message.
    console.error("[signup] unexpected error:", e);
    return { error: "Something went wrong creating your account. Please try again." };
  }
}

/**
 * Keep the code unless the portal POSITIVELY says it is not an active agent's.
 * No portal configured, a timeout or any error means keep it: signup never
 * fails, and never loses an agent's customer, because the portal is down.
 */
async function keepUnlessRefused(code: string): Promise<string | null> {
  const config = portalConfig();
  if (!config) return code;
  return portalRefusedCode(await lookupAgentCode(config, code)) ? null : code;
}
