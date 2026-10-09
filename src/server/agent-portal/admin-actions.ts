"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { normalizeReferralCode } from "@/lib/agent-kit/ref";
import { lookupAgentCode } from "@/lib/agent-kit/client";
import { portalRefusedCode } from "@/lib/agent-portal/referral";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { uploadMenuImageBytes } from "@/server/storage/menu-images";
import { portalConfig } from "./config";
import { enqueueCustomerSignedUp } from "./events";
import { retryFailedEvent } from "./outbox";
import { getPaymentDetails } from "./billing";

export type AdminFormState = { ok?: boolean; error?: string; message?: string } | null;

const PAGE = "/super-admin/agents";
const QR_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Attach a sales agent's code to an existing restaurant — ADD-ONLY. Once a
 * code is set it never changes (a database trigger refuses it), and setting
 * one queues customer.signed_up exactly as if the owner had arrived with it.
 * From then on the restaurant is billed through the agent portal.
 *
 * The portal refuses a signup without an owner phone forever, so the phone is
 * checked HERE, with a sentence, rather than discovered in the failed queue.
 */
export async function attachAgentCode(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  try {
    await requireOwnerAction();
  } catch {
    return { error: "Only the owner account can do this." };
  }
  const restaurantRef = String(fd.get("restaurant") ?? "").trim();
  const code = normalizeReferralCode(String(fd.get("agentCode") ?? ""));
  const ownerName = String(fd.get("ownerName") ?? "").trim().slice(0, 120);
  let ownerPhone = String(fd.get("ownerPhone") ?? "").trim().slice(0, 40);
  if (!restaurantRef) return { error: "Enter the restaurant's slug or ID." };
  if (!code) return { error: "That isn't a valid agent code (4–20 letters and numbers)." };
  if (!ownerName) return { error: "Enter the owner's name." };

  const config = portalConfig();
  if (config) {
    if (portalRefusedCode(await lookupAgentCode(config, code))) {
      return { error: `The agent portal says ${code} is not an active agent's code.` };
    }
  }

  try {
    const result = await systemDb(async (tx) => {
      const restaurant = await tx.restaurant.findFirst({
        where: /^[0-9a-f-]{36}$/i.test(restaurantRef) ? { id: restaurantRef } : { slug: restaurantRef.toLowerCase() },
        select: { id: true, name: true, printerConfig: true },
      });
      if (!restaurant) return { error: "No restaurant with that slug or ID." };
      const existing = await tx.agentAccount.findUnique({
        where: { restaurantId: restaurant.id },
        select: { agentCode: true },
      });
      if (existing) {
        return { error: `${restaurant.name} already has agent code ${existing.agentCode}. Codes can't be changed.` };
      }
      if (!ownerPhone) {
        const receipt = (restaurant.printerConfig as { receipt?: { phone?: string } } | null)?.receipt;
        ownerPhone = receipt?.phone?.trim() ?? "";
      }
      if (!ownerPhone) {
        return { error: `${restaurant.name} has no owner phone number on file. Enter one — the agent portal requires it.` };
      }
      await tx.agentAccount.create({
        data: { restaurantId: restaurant.id, agentCode: code, ownerName, ownerPhone },
        select: { restaurantId: true },
      });
      await enqueueCustomerSignedUp(tx, restaurant.id);
      return { ok: true, message: `${code} attached to ${restaurant.name}. Their billing now runs through the agent portal.` };
    });
    revalidatePath(PAGE);
    return result;
  } catch (e) {
    console.error("[agents] attach failed:", e);
    return { error: "Couldn't attach the code. Please try again." };
  }
}

/** Retry one failed outbox event. */
export async function retryEvent(fd: FormData): Promise<void> {
  await requireOwnerAction();
  await retryFailedEvent(String(fd.get("id") ?? ""));
  revalidatePath(PAGE);
}

/**
 * Where agent-referred owners send money — one platform-wide block: a payment
 * QR plus GCash / Maya / bank details and a note. Public information, shown to
 * owners on their billing page once they have signed.
 */
export async function savePaymentDetails(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  try {
    await requireOwnerAction();
  } catch {
    return { error: "Only the owner account can do this." };
  }
  const s = (k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);

  const current = await getPaymentDetails();
  let qrUrl = fd.get("removeQr") === "on" ? null : current.qrUrl;
  const file = fd.get("qr");
  if (file instanceof File && file.size > 0) {
    const ext = QR_TYPES[file.type];
    if (!ext) return { error: "The QR must be a PNG, JPEG or WebP image." };
    if (file.size > 4 * 1024 * 1024) return { error: "The QR image must be under 4 MB." };
    try {
      qrUrl = await uploadMenuImageBytes("platform-payment", new Uint8Array(await file.arrayBuffer()), ext, file.type);
    } catch (e) {
      console.error("[agents] QR upload failed:", e);
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

  try {
    await systemDb((tx) =>
      tx.paymentCollection.upsert({
        where: { id: "platform" },
        create: { id: "platform", details },
        update: { details },
        select: { id: true },
      }),
    );
  } catch (e) {
    console.error("[agents] save payment details failed:", e);
    return { error: "Couldn't save. Has add-agent-portal.sql been run?" };
  }
  revalidatePath(PAGE);
  return { ok: true, message: "Saved." };
}
