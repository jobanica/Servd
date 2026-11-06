import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import {
  agreementCovers,
  commissionFor,
  commissionableTotal,
  dateOnly,
  isVoidedOrder,
  owesCommission,
  paymentMethodOf,
  PLATFORM_SOURCES,
} from "@/lib/neighborhood/commission";

/**
 * Commission accrual, as an idempotent sync — never inside an order path.
 *
 * It reads completed platform orders of neighborhood partners and writes one
 * entry per order, already `confirmed`: a delivered order counts without
 * anyone having to approve it. A partner who says an order didn't really
 * happen flags it, which moves it to `disputed` for Servd to review. The unique index on commission_entries.orderId
 * plus `skipDuplicates` make re-running it harmless: it can never charge an
 * order twice. Because it runs apart from checkout, a failure here can never
 * fail, slow down or roll back a customer's order; a missed run is simply
 * caught up by the next one (every 15 minutes by cron, and on demand).
 *
 * It also flips entries for orders later cancelled or refunded to
 * `cancelled`, while they're not yet on an issued statement. An issued
 * statement is never edited; a correction there is an adjustment entry.
 */

const BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SyncSummary {
  partners: number;
  accrued: number;
  cancelled: number;
}

export async function syncCommissions(opts: { partnerId?: string; now?: Date } = {}): Promise<SyncSummary> {
  const now = opts.now ?? new Date();
  const summary: SyncSummary = { partners: 0, accrued: 0, cancelled: 0 };

  const partners = await systemDb((tx) =>
    tx.territoryPartner.findMany({
      where: { status: "active", ...(opts.partnerId ? { id: opts.partnerId } : {}) },
      select: {
        id: true,
        restaurantId: true,
        status: true,
        startsOn: true,
        endsOn: true,
        commissionRateBps: true,
        restaurant: { select: { commercialTrack: true } },
      },
    }),
  );

  for (const p of partners) {
    // The first guard: only a neighborhood account. A standard account is
    // never read, let alone charged.
    if (p.restaurant.commercialTrack !== "neighborhood") continue;
    summary.partners++;
    try {
      summary.accrued += await accruePartner(p, now);
      summary.cancelled += await cancelVoided(p.id);
    } catch (e) {
      // One partner's trouble must not stop the others; the next run retries.
      console.error("neighborhood accrual failed for partner", p.id, e);
    }
  }
  return summary;
}

type Partner = {
  id: string;
  restaurantId: string;
  status: string;
  startsOn: Date;
  endsOn: Date | null;
  commissionRateBps: number;
  restaurant: { commercialTrack: string };
};

async function accruePartner(p: Partner, now: Date): Promise<number> {
  // The agreement's window in instants: its first day (Manila midnight) to the
  // day after its last, or now.
  const from = new Date(`${dateOnly(p.startsOn)}T00:00:00+08:00`);
  const to = p.endsOn ? new Date(new Date(`${dateOnly(p.endsOn)}T00:00:00+08:00`).getTime() + DAY_MS) : now;

  const orders = await systemDb((tx) =>
    tx.order.findMany({
      where: {
        restaurantId: p.restaurantId,
        createdAt: { gte: from, lt: to },
        source: { in: [...PLATFORM_SOURCES] },
        status: "closed",
        paymentStatus: { not: "refunded" },
        commissionEntries: { none: {} },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: {
        id: true,
        source: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        total: true,
        discountAmount: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            refundedAmount: true,
            modifiers: { select: { priceDeltaAtTime: true } },
          },
        },
        payments: { select: { gateway: true, status: true } },
      },
    }),
  );

  const rows = orders
    // Re-checked per order against the one guard everything shares.
    .filter((o) => owesCommission(p.restaurant, p, o))
    .map((o) => {
      const base = commissionableTotal(o.items, o.discountAmount);
      return {
        orderId: o.id,
        kind: "order",
        territoryPartnerId: p.id,
        orderTotal: o.total,
        commissionableTotal: base,
        rateBps: p.commissionRateBps,
        commissionAmount: commissionFor(base, p.commissionRateBps),
        paymentMethod: paymentMethodOf(o.payments),
        // Recorded as confirmed on completion — no waiting for approval.
        state: "confirmed",
        orderedAt: o.createdAt,
      };
    });
  if (rows.length === 0) return 0;

  const r = await systemDb((tx) => tx.commissionEntry.createMany({ data: rows, skipDuplicates: true }));
  return r.count;
}

/** Entries whose order was later cancelled or refunded, not yet on an issued statement. */
async function cancelVoided(partnerId: string): Promise<number> {
  return systemDb(async (tx) => {
    const open = await tx.commissionEntry.findMany({
      where: {
        territoryPartnerId: partnerId,
        kind: "order",
        state: { in: ["pending", "confirmed", "disputed"] },
        OR: [{ statementId: null }, { statement: { status: "draft" } }],
      },
      select: { id: true, order: { select: { status: true, paymentStatus: true } } },
    });
    const ids = open.filter((e) => e.order && isVoidedOrder(e.order)).map((e) => e.id);
    if (ids.length === 0) return 0;
    const r = await tx.commissionEntry.updateMany({
      where: { id: { in: ids } },
      data: { state: "cancelled", statementId: null },
    });
    return r.count;
  });
}

/** Does this restaurant have an agreement covering now? (For the partner page and attribution.) */
export async function activeAgreementFor(restaurantId: string) {
  const rows = await systemDb((tx) =>
    tx.territoryPartner.findMany({
      where: { restaurantId, status: "active" },
      orderBy: { startsOn: "desc" },
      select: {
        id: true,
        territoryId: true,
        status: true,
        startsOn: true,
        endsOn: true,
        commissionRateBps: true,
        category: true,
        territory: { select: { name: true } },
      },
    }),
  );
  return rows.find((a) => agreementCovers(a, new Date())) ?? null;
}
