"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { encryptJson, decryptJson } from "@/lib/crypto/secrets";

export type FormState = { ok?: boolean; error?: string } | null;

interface StoredCredentials {
  secretKey: string;
  webhookSecret: string;
}

const schema = z.object({
  gateway: z.enum(["paymongo", "xendit"]).default("paymongo"),
  // Blank => keep whatever's already stored (so admins don't re-enter secrets).
  secretKey: z.string().trim().optional().or(z.literal("")),
  webhookSecret: z.string().trim().optional().or(z.literal("")),
  enabled: z.coerce.boolean().default(false),
});

export async function updatePaymentSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = schema.safeParse({
    gateway: formData.get("gateway") ?? "paymongo",
    secretKey: formData.get("secretKey") ?? "",
    webhookSecret: formData.get("webhookSecret") ?? "",
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return { error: "Invalid settings" };

  try {
    await tenantDb(restaurantId, async (tx) => {
      const current = await tx.restaurant.findFirstOrThrow({
        select: { paymentCredentialsEnc: true },
      });

      const existing: StoredCredentials = current.paymentCredentialsEnc
        ? decryptJson<StoredCredentials>(current.paymentCredentialsEnc)
        : { secretKey: "", webhookSecret: "" };

      const merged: StoredCredentials = {
        secretKey: parsed.data.secretKey || existing.secretKey,
        webhookSecret: parsed.data.webhookSecret || existing.webhookSecret,
      };

      const hasCreds = !!merged.secretKey && !!merged.webhookSecret;
      if (parsed.data.enabled && !hasCreds) {
        throw new Error("Enter both keys before enabling online payment.");
      }

      await tx.restaurant.update({
        where: { id: restaurantId },
        data: {
          paymentGateway: parsed.data.gateway,
          paymentCredentialsEnc: hasCreds ? encryptJson(merged) : null,
          paymentOnlineEnabled: parsed.data.enabled && hasCreds,
        },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save settings" };
  }

  revalidatePath("/admin/payments");
  return { ok: true };
}
