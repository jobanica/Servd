import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { activeAgreementFor, syncCommissions } from "@/server/neighborhood/accrual";
import {
  commissionFor,
  commissionableTotal,
  manilaMonth,
  monthPeriod,
  PLATFORM_SOURCES,
} from "@/lib/neighborhood/commission";

/**
 * The partner's own view (owner dashboard, neighborhood accounts only): this
 * month's platform orders each with its commission line, what's accruing, the
 * last statement and what's owed. Every query is filtered to the signed-in
 * restaurant, so a partner can only ever see its own.
 */
export async function getPartnerCommission(restaurantId: string, now = new Date()) {
  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { id: restaurantId }, select: { commercialTrack: true } }),
  );
  if (restaurant?.commercialTrack !== "neighborhood") return null;

  const agreement = await activeAgreementFor(restaurantId);
  // Fresh lines for this partner before showing them (idempotent, best-effort).
  if (agreement) await syncCommissions({ partnerId: agreement.id, now }).catch(() => null);

  const month = monthPeriod(manilaMonth(now))!;
  const partnerIds = (
    await systemDb((tx) => tx.territoryPartner.findMany({ where: { restaurantId }, select: { id: true } }))
  ).map((p) => p.id);

  const [orders, entries, statements] = await systemDb((tx) =>
    Promise.all([
      tx.order.findMany({
        where: { restaurantId, source: { in: [...PLATFORM_SOURCES] }, createdAt: { gte: month.from, lt: month.to } },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          createdAt: true,
          status: true,
          paymentStatus: true,
          orderType: true,
          customerName: true,
          total: true,
          discountAmount: true,
          items: {
            select: { quantity: true, unitPrice: true, refundedAmount: true, modifiers: { select: { priceDeltaAtTime: true } } },
          },
        },
      }),
      partnerIds.length
        ? tx.commissionEntry.findMany({
            where: { territoryPartnerId: { in: partnerIds }, orderedAt: { gte: month.from, lt: month.to } },
            select: {
              id: true,
              orderId: true,
              kind: true,
              state: true,
              commissionAmount: true,
              commissionableTotal: true,
              disputeNote: true,
              note: true,
              statementId: true,
              statement: { select: { status: true } },
            },
          })
        : Promise.resolve([]),
      partnerIds.length
        ? tx.commissionStatement.findMany({
            where: { territoryPartnerId: { in: partnerIds }, status: { not: "draft" } },
            orderBy: { periodStart: "desc" },
            take: 12,
          })
        : Promise.resolve([]),
    ]),
  );

  const entryByOrder = new Map(entries.filter((e) => e.orderId).map((e) => [e.orderId!, e]));
  const rate = agreement?.commissionRateBps ?? 0;
  const lines = orders.map((o) => {
    const entry = entryByOrder.get(o.id);
    const base = entry ? entry.commissionableTotal : commissionableTotal(o.items, o.discountAmount);
    return {
      id: o.id,
      createdAt: o.createdAt,
      orderType: o.orderType,
      customerName: o.customerName,
      status: o.status,
      total: o.total,
      commissionable: base,
      // The entry's own figure once accrued; until then what it will be when completed.
      commission: entry ? entry.commissionAmount : o.status === "cancelled" ? 0 : commissionFor(base, rate),
      entry: entry
        ? {
            id: entry.id,
            state: entry.state,
            disputeNote: entry.disputeNote,
            open: !entry.statementId || entry.statement?.status === "draft",
          }
        : null,
    };
  });

  const accruing = entries.filter((e) => ["pending", "confirmed", "disputed"].includes(e.state));
  const owed = statements
    .filter((s) => s.status === "issued" || s.status === "partially_paid")
    .reduce((s, st) => s + Math.max(0, st.commissionDue - st.amountPaid), 0);

  return {
    agreement,
    rateBps: rate,
    lines,
    month: manilaMonth(now),
    orderCount: lines.filter((l) => l.status === "closed").length,
    gross: accruing.filter((e) => e.kind === "order").reduce((s, e) => s + e.commissionableTotal, 0),
    accruing: accruing.reduce((s, e) => s + e.commissionAmount, 0),
    lastStatement: statements[0] ?? null,
    owed,
    adjustments: entries.filter((e) => e.kind === "adjustment"),
  };
}
