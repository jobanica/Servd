"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import type { PrintMethod } from "@prisma/client";

export type FormState = { ok?: boolean; error?: string } | null;

const schema = z.object({
  printMethod: z.enum(["network", "cloud", "bluetooth", "os_dialog"]),
  autoPrint: z.coerce.boolean().default(false),
  bridgeUrl: z.string().url().optional().or(z.literal("")),
});

export async function updatePrintSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = schema.safeParse({
    printMethod: formData.get("printMethod"),
    autoPrint: formData.get("autoPrint") === "on",
    bridgeUrl: formData.get("bridgeUrl") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }

  await tenantDb(restaurantId, async (tx) => {
    const current = await tx.restaurant.findFirstOrThrow({
      select: { printerConfig: true },
    });
    const cfg = (current.printerConfig as Record<string, unknown> | null) ?? {};

    // Ensure a poll token exists for the cloud transport.
    if (parsed.data.printMethod === "cloud" && !cfg.pollToken) {
      cfg.pollToken = randomBytes(16).toString("hex");
    }
    if (parsed.data.bridgeUrl) cfg.bridgeUrl = parsed.data.bridgeUrl;

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        printMethod: parsed.data.printMethod as PrintMethod,
        autoPrint: parsed.data.autoPrint,
        printerConfig: cfg as object,
      },
    });
  });

  revalidatePath("/admin/printing");
  return { ok: true };
}
