"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { newEventId } from "@/lib/agent-kit";
import { requestSigningLink, uploadReceipt } from "@/lib/agent-kit/client";
import { canSubmitActivation, parseReceiptForm } from "@/lib/agent-kit/billing";
import { normalizeBankReference } from "@/lib/agent-portal/lapse";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { rateLimit } from "@/server/build/rate-limit";
import { portalConfig } from "./config";
import { enqueueProductEvent } from "./events";

export type ReceiptFormState = { status: "idle" | "done" | "error"; message?: string };

const DUPLICATE_REFERENCE =
  "That bank reference number has already been used. Each payment has its own — check the receipt and try again.";

/**
 * Send the owner to the portal's signing page. The portal hosts the agreement;
 * Servd only asks for a link. No link usually means the portal has not
 * processed this signup yet — "try again in a moment", never an error page.
 */
export async function openAgreement(): Promise<{ error: string } | void> {
  let restaurantId: string;
  try {
    ({ restaurantId } = await requireAdminAction());
  } catch {
    return { error: "Only the owner can sign the agreement." };
  }
  const config = portalConfig();
  if (!config) return { error: "Signing isn't open yet. Please try again later." };
  const link = await requestSigningLink(config, restaurantId);
  if (!link) return { error: "Your account is still being set up. Please try again in a moment." };
  if (link.alreadySigned) {
    revalidatePath("/admin/billing");
    return { error: "You've already signed — it can take a minute to show here." };
  }
  redirect(link.url);
}

/**
 * The owner uploads proof of a bank transfer.
 *
 * Synchronous, unlike every other portal interaction: the image goes to the
 * PORTAL's storage now, while the owner is looking at the form, because "try
 * again" beats a receipt that silently never arrives. Only the returned path
 * is kept. The payment row and payment.submitted are then written in ONE
 * transaction, and the worker delivers the event.
 *
 * Nothing here grants access — only the portal's payment.confirmed does.
 */
export async function submitReceipt(_prev: ReceiptFormState, fd: FormData): Promise<ReceiptFormState> {
  let user;
  try {
    user = await requireAdminAction();
  } catch {
    return { status: "error", message: "Only the owner can submit payments. Please sign in again." };
  }
  const restaurantId = user.restaurantId;

  const limited = await rateLimit("agent:receipt");
  if (!limited.ok) return { status: "error", message: limited.error ?? "Please try again later." };

  const config = portalConfig();
  if (!config) return { status: "error", message: "Payments aren't open yet. Please try again later." };

  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") fields[k] = v;
  const parsed = parseReceiptForm(fields);
  if (!parsed.ok) return { status: "error", message: parsed.error };
  const input = { ...parsed.input, bankReference: normalizeBankReference(parsed.input.bankReference) };

  const file = fd.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Attach a photo or screenshot of your receipt." };
  }

  const state = await tenantDb(restaurantId, async (tx) => ({
    agent: await tx.agentAccount.findFirst({ select: { contractStatus: true } }),
    payments: await tx.subscriptionManualPayment.findMany({ select: { type: true, status: true } }),
  }));
  if (!state.agent) return { status: "error", message: "This account isn't billed by receipt." };
  if (input.type === "activation" && state.agent.contractStatus !== "signed") {
    return { status: "error", message: "Sign the service agreement before paying the activation." };
  }
  if (input.type === "activation" && !canSubmitActivation(state.payments)) {
    return { status: "error", message: "Your activation payment has already been sent." };
  }
  // Globally unique — another restaurant's receipt counts too. Checked before
  // the upload so a mistake costs nothing; the unique index is the real guard.
  const clash = await systemDb((tx) =>
    tx.subscriptionManualPayment.findUnique({ where: { bankReference: input.bankReference }, select: { id: true } }),
  );
  if (clash) return { status: "error", message: DUPLICATE_REFERENCE };

  const upload = await uploadReceipt(config, new Uint8Array(await file.arrayBuffer()), file.type);
  if (!upload.ok) return { status: "error", message: upload.error };

  const eventId = newEventId();
  try {
    await systemDb(async (tx) => {
      await tx.subscriptionManualPayment.create({
        data: {
          restaurantId,
          type: input.type,
          monthsCovered: input.monthsCovered,
          billingMonthStart: input.billingMonth ? new Date(`${input.billingMonth}-01T00:00:00Z`) : null,
          amountCentavos: input.amount,
          bankReference: input.bankReference,
          receiptPath: upload.receiptPath,
          submittedBy: user.email ?? null,
          eventId,
        },
        select: { id: true },
      });
      const queued = await enqueueProductEvent(
        tx,
        restaurantId,
        "payment.submitted",
        {
          type: input.type,
          months_covered: input.monthsCovered,
          billing_month_start: input.billingMonth,
          amount: input.amount,
          bank_reference: input.bankReference,
          receipt_path: upload.receiptPath,
        },
        { eventId },
      );
      if (!queued) throw new Error("payment.submitted was not queued");
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: "error", message: DUPLICATE_REFERENCE };
    }
    console.error("[agent-billing] receipt submit failed:", e);
    return { status: "error", message: "Your receipt couldn't be saved. Please try again." };
  }

  revalidatePath("/admin/billing");
  return {
    status: "done",
    message: "Receipt sent. We'll confirm it shortly — usually within one business day.",
  };
}
