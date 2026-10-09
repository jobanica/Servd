import "server-only";
import type { Prisma } from "@prisma/client";
import type { PortalCallback } from "@/lib/agent-kit";
import { normalizeBankReference } from "@/lib/agent-portal/lapse";
import { applyPaidCoverage } from "./coverage";

type Tx = Prisma.TransactionClient;

export type CallbackOutcome =
  | "applied"
  | "duplicate"
  | "unknown_restaurant"
  | "unknown_payment";

/**
 * apply_portal_callback: dedupe, apply and record, in the caller's ONE system
 * transaction. Callbacks are at-least-once; the inbox insert is what makes a
 * redelivery a no-op — and it uses ON CONFLICT DO NOTHING so a duplicate does
 * not abort the transaction it sits in.
 *
 * A callback naming a restaurant or receipt Servd does not know is recorded
 * and answered 200: retrying it would not make it known.
 */
export async function applyPortalCallback(tx: Tx, cb: PortalCallback, now = new Date()): Promise<CallbackOutcome> {
  const inserted = await tx.productCallbackInbox.createMany({
    data: [{ eventId: cb.event_id, type: cb.type, payload: cb as unknown as Prisma.InputJsonValue }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return "duplicate";

  const outcome = await apply(tx, cb, now);
  await tx.productCallbackInbox.update({
    where: { eventId: cb.event_id },
    data: { outcome },
    select: { eventId: true },
  });
  return outcome;
}

async function apply(tx: Tx, cb: PortalCallback, now: Date): Promise<CallbackOutcome> {
  const restaurantId = cb.data.external_customer_id;
  const agent = await tx.agentAccount.findUnique({ where: { restaurantId }, select: { restaurantId: true } });
  if (!agent) return "unknown_restaurant";

  if (cb.type === "contract.signed") {
    await tx.agentAccount.update({
      where: { restaurantId },
      data: {
        contractStatus: "signed",
        contractId: cb.data.contract_id,
        contractSignedAt: new Date(cb.data.signed_at),
        contractMinimumTermEndsAt: new Date(cb.data.minimum_term_ends_at),
      },
      select: { restaurantId: true },
    });
    return "applied";
  }

  const payment = await tx.subscriptionManualPayment.findFirst({
    where: { restaurantId, bankReference: normalizeBankReference(cb.data.bank_reference) },
    select: { id: true },
  });
  if (!payment) return "unknown_payment";

  const status =
    cb.type === "payment.confirmed" ? "confirmed" : cb.type === "payment.rejected" ? "rejected" : "reversed";
  await tx.subscriptionManualPayment.update({
    where: { id: payment.id },
    data: {
      status,
      reason: cb.type === "payment.confirmed" ? null : cb.data.reason,
      decidedAt: now,
    },
    select: { id: true },
  });

  // Recomputed from every confirmed payment, so a replay or a reversal lands
  // on the right answer. Never suspends — only the sweep does.
  await applyPaidCoverage(tx, restaurantId, now);
  return "applied";
}
