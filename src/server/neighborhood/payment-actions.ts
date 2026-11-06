"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { uploadMenuImageBytes } from "@/server/storage/menu-images";
import type { AdminFormState } from "@/server/agent-portal/admin-actions";
import { getCommissionPaymentDetails, NEIGHBORHOOD_PAYMENT_ROW } from "@/server/neighborhood/payment-details";

const QR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Save where neighborhood partners pay their weekly commission: the bank QR
 * and account details they see behind "Pay commission". Founder-only. Public
 * information (it's what a partner pays into), so the QR is a public image.
 */
export async function saveCommissionPaymentDetails(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  try {
    await requireOwnerAction();
  } catch {
    return { error: "Only the owner account can do this." };
  }
  const s = (k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);

  const current = await getCommissionPaymentDetails();
  let qrUrl = fd.get("removeQr") === "on" ? null : current.qrUrl;
  const file = fd.get("qr");
  if (file instanceof File && file.size > 0) {
    const ext = QR_TYPES[file.type];
    if (!ext) return { error: "The QR must be a PNG, JPEG or WebP image." };
    if (file.size > 4 * 1024 * 1024) return { error: "The QR image must be under 4 MB." };
    try {
      qrUrl = await uploadMenuImageBytes("neighborhood-payment", new Uint8Array(await file.arrayBuffer()), ext, file.type);
    } catch {
      return { error: "The QR image couldn't be uploaded. Please try again." };
    }
  }

  const details = {
    qrUrl,
    gcash: { name: s("gcashName"), number: s("gcashNumber", 40) },
    maya: { name: s("mayaName"), number: s("mayaNumber", 40) },
    bank: { bank: s("bankName"), name: s("bankAccountName"), number: s("bankAccountNumber", 40) },
    note: s("note", 500),
  } as unknown as Prisma.InputJsonValue;

  await systemDb((tx) =>
    tx.paymentCollection.upsert({
      where: { id: NEIGHBORHOOD_PAYMENT_ROW },
      create: { id: NEIGHBORHOOD_PAYMENT_ROW, details },
      update: { details },
      select: { id: true },
    }),
  );
  revalidatePath("/super-admin/neighborhood/statements");
  revalidatePath("/admin/commission");
  return { ok: true, message: "Saved — partners see this when they tap Pay commission." };
}
