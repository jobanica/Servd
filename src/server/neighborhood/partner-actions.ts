"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";

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
