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
  kitchenDisplay: z.coerce.boolean().default(true),
  bridgeUrl: z.string().url().optional().or(z.literal("")),
  receiptAddress: z.string().max(120).optional(),
  receiptPhone: z.string().max(60).optional(),
  receiptWebsite: z.string().max(120).optional(),
  receiptFooter: z.string().max(300).optional(),
});

export async function updatePrintSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  const parsed = schema.safeParse({
    printMethod: formData.get("printMethod"),
    autoPrint: formData.get("autoPrint") === "on",
    kitchenDisplay: formData.get("kitchenDisplay") === "on",
    bridgeUrl: formData.get("bridgeUrl") ?? "",
    receiptAddress: formData.get("receiptAddress") ?? "",
    receiptPhone: formData.get("receiptPhone") ?? "",
    receiptWebsite: formData.get("receiptWebsite") ?? "",
    receiptFooter: formData.get("receiptFooter") ?? "",
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

    // Receipt branding (trim to null so blanks don't print empty lines).
    const trimOrNull = (s?: string) => {
      const v = (s ?? "").trim();
      return v.length ? v : null;
    };
    cfg.receipt = {
      address: trimOrNull(parsed.data.receiptAddress),
      phone: trimOrNull(parsed.data.receiptPhone),
      website: trimOrNull(parsed.data.receiptWebsite),
      footer: trimOrNull(parsed.data.receiptFooter),
    };

    // Mark the printer method as deliberately chosen (drives onboarding).
    cfg.configured = true;

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: {
        printMethod: parsed.data.printMethod as PrintMethod,
        autoPrint: parsed.data.autoPrint,
        printerConfig: cfg as object,
      },
      select: { id: true },
    });
  });

  // Kitchen display/print toggle — best-effort so a lagging column can't block
  // the rest of the printer settings from saving.
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.restaurant.updateMany({ where: { id: restaurantId }, data: { kitchenDisplay: parsed.data.kitchenDisplay } }),
    );
  } catch {
    /* kitchenDisplay column not migrated yet */
  }

  revalidatePath("/admin/printing");
  return { ok: true };
}
