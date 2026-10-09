import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { deliverEvent, retryDelayMs, type ProductEvent } from "@/lib/agent-kit";
import { portalConfig } from "./config";

/**
 * Delivering the outbox. Only the worker calls this — never a user request,
 * so a portal outage is a queue that drains late, not a failed signup.
 */

/** How long a claimed row stays invisible to another drain while it is sent. */
export const OUTBOX_LEASE_MS = 2 * 60 * 1000;

export interface ClaimedEvent {
  id: string;
  restaurantId: string;
  attempts: number;
  payload: unknown;
}

/**
 * Claim the next event for each customer — ONLY the oldest pending one per
 * restaurant, and only if it is due. A customer's events therefore reach the
 * portal in the order they happened (signup before any payment, cancelled
 * before reactivated), and a row stuck retrying holds back that one customer
 * and nobody else.
 *
 * Claimed by LEASING: nextAttemptAt is pushed forward in this short statement
 * and the HTTP call happens afterwards, outside any transaction. A leased head
 * is still the oldest pending row, so it keeps blocking its customer's later
 * events. If the process dies mid-send the lease simply runs out. A second
 * drain racing this one re-checks `nextAttemptAt <= now` on the locked row and
 * skips it.
 */
export async function claimDueHeads(now: Date, limit: number): Promise<ClaimedEvent[]> {
  const leaseUntil = new Date(now.getTime() + OUTBOX_LEASE_MS);
  const rows = await systemDb((tx) =>
    tx.$queryRaw<(ClaimedEvent & { createdAt: Date })[]>`
      WITH heads AS (
        SELECT DISTINCT ON ("restaurantId") id, "nextAttemptAt", "createdAt"
          FROM product_event_outbox
         WHERE status = 'pending'
         ORDER BY "restaurantId", "createdAt", id
      ), due AS (
        SELECT id FROM heads
         WHERE "nextAttemptAt" <= ${now}
         ORDER BY "createdAt"
         LIMIT ${limit}
      )
      UPDATE product_event_outbox o
         SET "nextAttemptAt" = ${leaseUntil}
        FROM due
       WHERE o.id = due.id
         AND o.status = 'pending'
         AND o."nextAttemptAt" <= ${now}
      RETURNING o.id, o."restaurantId", o.attempts, o.payload, o."createdAt"`,
  );
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(({ id, restaurantId, attempts, payload }) => ({ id, restaurantId, attempts, payload }));
}

export interface DrainSummary {
  configured: boolean;
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
}

/**
 * Deliver what is due. Unconfigured, it claims nothing and sends nothing:
 * events keep queueing and go out once all three AGENT_PORTAL_* are set.
 */
export async function drainOutbox(
  opts: { limit?: number; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<DrainSummary> {
  const summary: DrainSummary = { configured: false, claimed: 0, sent: 0, retrying: 0, failed: 0 };
  const config = portalConfig();
  if (!config) return summary;
  summary.configured = true;

  const claimed = await claimDueHeads(opts.now ?? new Date(), opts.limit ?? 50);
  summary.claimed = claimed.length;

  for (const row of claimed) {
    const event = row.payload as ProductEvent;
    const result = await deliverEvent(config, event, opts.fetchImpl ?? fetch);
    const at = new Date();
    await systemDb(async (tx) => {
      if (result.kind === "delivered") {
        // processed | pending | duplicate | refused — all four mean stop.
        await tx.productEventOutbox.update({
          where: { id: row.id },
          data: {
            status: "sent",
            sentAt: at,
            portalStatus: result.response?.status ?? null,
            lastStatus: 200,
            lastError: result.response?.error ?? null,
            attempts: { increment: 1 },
          },
          select: { id: true },
        });
        if (result.response?.status === "refused" && event.type === "payment.submitted") {
          // The portal recorded the receipt but will never act on it. Tell the
          // owner, or they wait for a confirmation that is not coming.
          await rejectPayment(tx, event.event_id, refusalReason(result.response.error));
        }
      } else if (result.kind === "failed") {
        await tx.productEventOutbox.update({
          where: { id: row.id },
          data: { status: "failed", lastStatus: result.status, lastError: result.error.slice(0, 500), attempts: { increment: 1 } },
          select: { id: true },
        });
        if (event.type === "payment.submitted") {
          await rejectPayment(tx, event.event_id, "This receipt could not be sent for review. Please contact support.");
        }
      } else {
        await tx.productEventOutbox.update({
          where: { id: row.id },
          data: {
            nextAttemptAt: new Date(at.getTime() + retryDelayMs(row.attempts + 1)),
            lastStatus: result.status,
            lastError: result.error.slice(0, 500),
            attempts: { increment: 1 },
          },
          select: { id: true },
        });
      }
    });
    summary[result.kind === "delivered" ? "sent" : result.kind === "failed" ? "failed" : "retrying"]++;
  }
  return summary;
}

async function rejectPayment(
  tx: Parameters<Parameters<typeof systemDb>[0]>[0],
  eventId: string,
  reason: string,
): Promise<void> {
  await tx.subscriptionManualPayment.updateMany({
    where: { eventId, status: "submitted" },
    data: { status: "rejected", reason, decidedAt: new Date() },
  });
}

export function refusalReason(code: string | undefined): string {
  if (code === "duplicate_bank_reference") return "That bank reference number has already been used.";
  if (code === "receipt_not_yours") return "This receipt could not be matched to your account. Please upload it again.";
  return "This receipt was not accepted. Please contact support.";
}

/**
 * Put a failed event back in the queue, due now (super-admin "Retry"). A
 * receipt whose event failed was shown to the owner as not sent; it goes back
 * to "submitted", since the portal never saw it to decide anything.
 */
export async function retryFailedEvent(id: string): Promise<boolean> {
  return systemDb(async (tx) => {
    const row = await tx.productEventOutbox.findFirst({
      where: { id, status: "failed" },
      select: { eventId: true, type: true },
    });
    if (!row) return false;
    await tx.productEventOutbox.update({
      where: { id },
      data: { status: "pending", nextAttemptAt: new Date(), lastError: null },
      select: { id: true },
    });
    if (row.type === "payment.submitted") {
      await tx.subscriptionManualPayment.updateMany({
        where: { eventId: row.eventId, status: "rejected" },
        data: { status: "submitted", reason: null, decidedAt: null },
      });
    }
    return true;
  });
}
