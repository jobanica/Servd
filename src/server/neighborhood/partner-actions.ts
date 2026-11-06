"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { uploadCommissionReceipt } from "@/server/storage/commission-receipts";

/**
 * What a neighborhood partner (the restaurant's owner) can do to its own
 * commission lines: confirm a completed order, or flag one as cancelled / not
 * completed. A flag sends the line to `disputed` for Servd to review — it
 * never waives it by itself — and takes it off any draft statement.
 *
 * Every change is scoped to agreements of the signed-in restaurant and to
 * lines not yet on an issued statement.
 */

type Result = { ok: true } | { ok: false; error: string };

async function own(entryId: string) {
  const me = await requireAdminAction();
  const entry = await systemDb((tx) =>
    tx.commissionEntry.findFirst({
      // Only a line under one of this restaurant's own agreements.
      where: { id: entryId, partner: { restaurantId: me.restaurantId } },
      select: { id: true, state: true, statementId: true, statement: { select: { status: true } } },
    }),
  );
  return entry && (!entry.statementId || entry.statement?.status === "draft") ? entry : null;
}

export async function partnerDispute(entryId: string, note: string): Promise<Result> {
  let entry;
  try {
    entry = await own(entryId);
  } catch {
    return { ok: false, error: "Only the owner can do this." };
  }
  const why = note.trim();
  if (!why) return { ok: false, error: "Say what happened to this order." };
  if (!entry || !["pending", "confirmed"].includes(entry.state)) return { ok: false, error: "This line can't be flagged now." };
  await systemDb((tx) =>
    tx.commissionEntry.updateMany({
      where: { id: entry!.id, state: { in: ["pending", "confirmed"] } },
      data: { state: "disputed", disputeNote: `Partner: ${why.slice(0, 480)}`, statementId: null },
    }),
  );
  revalidatePath("/admin/commission");
  return { ok: true };
}

export async function partnerConfirm(entryId: string): Promise<Result> {
  let entry;
  try {
    entry = await own(entryId);
  } catch {
    return { ok: false, error: "Only the owner can do this." };
  }
  if (!entry || entry.state !== "pending") return { ok: false, error: "This line can't be confirmed now." };
  await systemDb((tx) => tx.commissionEntry.updateMany({ where: { id: entry!.id, state: "pending" }, data: { state: "confirmed" } }));
  revalidatePath("/admin/commission");
  return { ok: true };
}

/**
 * The partner pays their commission by bank QR and uploads the receipt. It
 * goes to Servd as `submitted`; nothing is marked paid until the founder
 * confirms it was received.
 */
export async function submitCommissionPayment(input: {
  amount: number; // centavos
  reference?: string | null;
  receipt: string; // data URL
}): Promise<Result> {
  let me;
  try {
    me = await requireAdminAction();
  } catch {
    return { ok: false, error: "Only the owner can do this." };
  }
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount you paid." };
  if (!input.receipt) return { ok: false, error: "Upload the receipt from your bank or GCash." };

  const agreement = await systemDb((tx) =>
    tx.territoryPartner.findFirst({
      where: { restaurantId: me.restaurantId, restaurant: { commercialTrack: "neighborhood" } },
      orderBy: [{ status: "asc" }, { startsOn: "desc" }],
      select: { id: true },
    }),
  );
  if (!agreement) return { ok: false, error: "This account isn't a neighborhood partner." };

  const waiting = await systemDb((tx) =>
    tx.commissionPayment.count({ where: { territoryPartnerId: agreement.id, status: "submitted" } }),
  );
  if (waiting >= 3) return { ok: false, error: "You have payments still waiting for confirmation. Servd will check them shortly." };

  let receiptPath: string;
  try {
    receiptPath = await uploadCommissionReceipt(agreement.id, input.receipt);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't upload the receipt." };
  }
  await systemDb((tx) =>
    tx.commissionPayment.create({
      data: {
        territoryPartnerId: agreement.id,
        amount,
        reference: input.reference?.trim().slice(0, 80) || null,
        receiptPath,
      },
      select: { id: true },
    }),
  );
  revalidatePath("/admin/commission");
  return { ok: true };
}
