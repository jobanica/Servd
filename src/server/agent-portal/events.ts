import "server-only";
import type { Prisma, RestaurantStatus } from "@prisma/client";
import { newEventId, productEventSchema, type ProductEventType } from "@/lib/agent-kit";

type Tx = Prisma.TransactionClient;

/**
 * Queueing events for the agent portal. Every function takes the caller's
 * transaction and never opens one: the event commits with the change it
 * describes, or not at all. Nothing here talks to the portal — the worker
 * (/api/cron/agent-portal) delivers the outbox.
 */

/**
 * The restaurant's agent code, or null. Read inside a savepoint so that on a
 * database where add-agent-portal.sql has not run yet, the missing table reads
 * as "no agent" instead of aborting the caller's transaction — this guard sits
 * in front of status changes every account goes through.
 */
export async function agentCodeOf(tx: Tx, restaurantId: string): Promise<string | null> {
  await tx.$executeRawUnsafe("SAVEPOINT agent_guard");
  try {
    const row = await tx.agentAccount.findUnique({
      where: { restaurantId },
      select: { agentCode: true },
    });
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT agent_guard");
    return row?.agentCode ?? null;
  } catch {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT agent_guard");
    return null;
  }
}

/**
 * Queue one event. A no-op — returns null — when the restaurant has no agent
 * code: that single guard is what keeps every other account out of this.
 *
 * Validated against the kit's schema before it is stored, so a malformed event
 * is a bug caught here rather than a row the portal refuses forever.
 */
export async function enqueueProductEvent(
  tx: Tx,
  restaurantId: string,
  type: ProductEventType,
  data: Record<string, unknown>,
  opts: { eventId?: string; skipDuplicates?: boolean } = {},
): Promise<string | null> {
  if (!(await agentCodeOf(tx, restaurantId))) return null;

  const event = {
    event_id: opts.eventId ?? newEventId(),
    type,
    occurred_at: new Date().toISOString(),
    data: { external_customer_id: restaurantId, ...data },
  };
  const parsed = productEventSchema.safeParse(event);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`agent-portal: invalid ${type} (${issue.path.join(".")}: ${issue.message})`);
  }

  const r = await tx.productEventOutbox.createMany({
    data: [
      {
        restaurantId,
        eventId: event.event_id,
        type,
        payload: event as unknown as Prisma.InputJsonValue,
      },
    ],
    // Only the signup event relies on this (one per restaurant, enforced by a
    // partial unique index); everything else is a fresh id.
    skipDuplicates: opts.skipDuplicates ?? false,
  });
  return r.count === 1 ? event.event_id : null;
}

/**
 * customer.signed_up, once per restaurant however often it is called. Built
 * from the agent row (written in the same transaction) and the restaurant.
 */
export async function enqueueCustomerSignedUp(tx: Tx, restaurantId: string): Promise<string | null> {
  const [agent, restaurant] = await Promise.all([
    tx.agentAccount.findUnique({
      where: { restaurantId },
      select: { agentCode: true, ownerName: true, ownerPhone: true },
    }),
    tx.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true, displayName: true } }),
  ]);
  if (!agent || !restaurant) return null;
  return enqueueProductEvent(
    tx,
    restaurantId,
    "customer.signed_up",
    {
      business_name: restaurant.displayName || restaurant.name,
      owner_name: agent.ownerName,
      owner_phone: agent.ownerPhone,
      agent_code: agent.agentCode,
      plan: "all-access",
    },
    { skipDuplicates: true },
  );
}

/**
 * Change a restaurant's status, and tell the portal in the same transaction
 * when that is a churn or a return: suspended → customer.cancelled, back from
 * suspended → customer.reactivated. Both directions go through here, or the
 * portal keeps believing a paying customer has left.
 *
 * For an account with no agent code this is exactly the status update it
 * always was.
 */
export async function setRestaurantStatus(
  tx: Tx,
  restaurantId: string,
  status: RestaurantStatus,
  reason?: string | null,
): Promise<void> {
  const before = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { status: true } });
  await tx.restaurant.update({ where: { id: restaurantId }, data: { status }, select: { id: true } });
  if (!before || before.status === status) return;

  if (status === "suspended") {
    await enqueueProductEvent(tx, restaurantId, "customer.cancelled", { reason: reason?.trim() || null });
  } else if (before.status === "suspended" && status === "active") {
    await enqueueProductEvent(tx, restaurantId, "customer.reactivated", {});
  }
}
