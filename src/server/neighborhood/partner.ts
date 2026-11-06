import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { activeAgreementFor, syncCommissions } from "@/server/neighborhood/accrual";
import { getCommissionPaymentDetails } from "@/server/neighborhood/payment-details";
import { signCommissionReceipts } from "@/server/storage/commission-receipts";
import {
  addDays,
  billingSaturday,
  commissionFor,
  commissionableTotal,
  manilaDate,
  PLATFORM_SOURCES,
} from "@/lib/neighborhood/commission";

/**
 * The partner's own view (owner dashboard, neighborhood accounts only):
 * what's due now (issued weekly statements, due every Saturday), what this
 * week has added so far, the last four weeks of platform orders each with its
 * commission line, their payments and where to pay. Every query is filtered to
 * the signed-in restaurant, so a partner only ever sees its own.
 */
export async function getPartnerCommission(restaurantId: string, now = new Date()) {
  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { id: restaurantId }, select: { commercialTrack: true } }),
  );
  if (restaurant?.commercialTrack !== "neighborhood") return null;

  const agreement = await activeAgreementFor(restaurantId);
  // Fresh lines for this partner before showing them (idempotent, best-effort).
  if (agreement) await syncCommissions({ partnerId: agreement.id, now }).catch(() => null);

  const today = manilaDate(now);
  const nextSaturday = billingSaturday(today);
  const weekStart = addDays(nextSaturday, -7); // this billing week began on the Saturday before
  const since = new Date(`${addDays(weekStart, -21)}T00:00:00+08:00`); // four weeks of orders

  const partnerIds = (
    await systemDb((tx) => tx.territoryPartner.findMany({ where: { restaurantId }, select: { id: true } }))
  ).map((p) => p.id);

  const [orders, entries, statements, payments, paymentDetails] = await Promise.all([
    systemDb((tx) =>
      tx.order.findMany({
        where: { restaurantId, source: { in: [...PLATFORM_SOURCES] }, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          createdAt: true,
          status: true,
          orderType: true,
          customerName: true,
          total: true,
          discountAmount: true,
          items: {
            select: { quantity: true, unitPrice: true, refundedAmount: true, modifiers: { select: { priceDeltaAtTime: true } } },
          },
        },
      }),
    ),
    partnerIds.length
      ? systemDb((tx) =>
          tx.commissionEntry.findMany({
            where: { territoryPartnerId: { in: partnerIds }, OR: [{ orderedAt: { gte: since } }, { statementId: null }] },
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
          }),
        )
      : Promise.resolve([]),
    partnerIds.length
      ? systemDb((tx) =>
          tx.commissionStatement.findMany({
            where: { territoryPartnerId: { in: partnerIds }, status: { not: "draft" } },
            orderBy: { periodStart: "desc" },
            take: 12,
          }),
        )
      : Promise.resolve([]),
    partnerIds.length
      ? systemDb((tx) =>
          tx.commissionPayment.findMany({
            where: { territoryPartnerId: { in: partnerIds } },
            orderBy: { submittedAt: "desc" },
            take: 10,
          }),
        )
      : Promise.resolve([]),
    getCommissionPaymentDetails(),
  ]);

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
      // The entry's own figure once recorded; until then what it will be when completed.
      commission: entry ? entry.commissionAmount : o.status === "cancelled" ? 0 : commissionFor(base, rate),
      billedOn: billingSaturday(manilaDate(o.createdAt)),
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

  // Owed now: issued weekly statements not yet paid in full.
  const unpaid = statements.filter((s) => s.status === "issued" || s.status === "partially_paid");
  const dueNow = unpaid.reduce((s, st) => s + Math.max(0, st.commissionDue - st.amountPaid), 0);
  // Not on a statement yet: what next Saturday will bill (confirmed lines and adjustments).
  const upcoming = entries.filter((e) => !e.statementId && e.state === "confirmed");
  const thisWeek = upcoming.reduce((s, e) => s + e.commissionAmount, 0);
  const awaiting = payments.filter((p) => p.status === "submitted").reduce((s, p) => s + p.amount, 0);
  const signed = await signCommissionReceipts(payments.map((p) => p.receiptPath));

  return {
    agreement,
    rateBps: rate,
    lines,
    today,
    nextSaturday,
    dueNow,
    unpaidWeeks: unpaid.length,
    oldestDue: unpaid.length ? unpaid[unpaid.length - 1].dueAt : null,
    thisWeek,
    thisWeekOrders: upcoming.filter((e) => e.kind === "order").length,
    awaitingConfirmation: awaiting,
    lastStatement: statements[0] ?? null,
    statements,
    payments: payments.map((p) => ({ ...p, receiptUrl: signed.get(p.receiptPath) ?? null })),
    paymentDetails,
    adjustments: entries.filter((e) => e.kind === "adjustment" && !e.statementId),
  };
}

/**
 * The home dashboard's commission card: what's owed now and what next Saturday
 * will bill. Reads only — no sync — so it adds almost nothing to the page.
 */
export async function commissionDueSummary(restaurantId: string, now = new Date()) {
  const rows = await systemDb((tx) =>
    tx.territoryPartner.findMany({
      where: { restaurantId, restaurant: { commercialTrack: "neighborhood" } },
      select: {
        statements: { where: { status: { in: ["issued", "partially_paid"] } }, select: { commissionDue: true, amountPaid: true } },
        entries: { where: { statementId: null, state: "confirmed" }, select: { commissionAmount: true } },
      },
    }),
  );
  if (rows.length === 0) return null;
  return {
    dueNow: rows.reduce((s, r) => s + r.statements.reduce((a, st) => a + Math.max(0, st.commissionDue - st.amountPaid), 0), 0),
    thisWeek: rows.reduce((s, r) => s + r.entries.reduce((a, e) => a + e.commissionAmount, 0), 0),
    nextSaturday: billingSaturday(manilaDate(now)),
  };
}
