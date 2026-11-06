import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import {
  addDays,
  applyPayment,
  manilaDate,
  monthPeriod,
  type AgingRow,
} from "@/lib/neighborhood/commission";

/**
 * Monthly statements. Confirmed entries for a month roll into a draft; the
 * founder reviews and issues it; payments are recorded against it (partial
 * payments allowed); on full payment its entries are settled.
 *
 * An issued statement is never edited — its totals, period and lines are
 * frozen. A correction is an adjustment entry, which lands on the next one.
 */

export const DEFAULT_DUE_DAYS = 7;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Build (or rebuild) the draft for one partner and month. Takes every
 * CONFIRMED entry not yet on a statement and dated up to the month's end —
 * which also carries forward a line from an earlier month that was disputed
 * and only confirmed later. Disputed, pending, waived and cancelled lines stay
 * off it.
 */
export async function generateStatement(partnerId: string, month: string): Promise<Result<{ statementId: string }>> {
  const period = monthPeriod(month);
  if (!period) return { ok: false, error: "Choose a month." };

  return systemDb(async (tx) => {
    const partner = await tx.territoryPartner.findFirst({ where: { id: partnerId }, select: { id: true } });
    if (!partner) return { ok: false, error: "Partner not found." };

    const existing = await tx.commissionStatement.findFirst({
      where: {
        territoryPartnerId: partnerId,
        periodStart: new Date(`${period.periodStart}T00:00:00Z`),
        periodEnd: new Date(`${period.periodEnd}T00:00:00Z`),
      },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== "draft") {
      return { ok: false, error: "This month's statement is already issued. Corrections go in as an adjustment." };
    }

    const statement =
      existing ??
      (await tx.commissionStatement.create({
        data: {
          territoryPartnerId: partnerId,
          periodStart: new Date(`${period.periodStart}T00:00:00Z`),
          periodEnd: new Date(`${period.periodEnd}T00:00:00Z`),
        },
        select: { id: true, status: true },
      }));

    // Rebuild from scratch: release anything this draft held that no longer qualifies.
    await tx.commissionEntry.updateMany({
      where: { statementId: statement.id, state: { not: "confirmed" } },
      data: { statementId: null },
    });
    await tx.commissionEntry.updateMany({
      where: {
        territoryPartnerId: partnerId,
        state: "confirmed",
        OR: [{ statementId: null }, { statementId: statement.id }],
        orderedAt: { lt: period.to },
      },
      data: { statementId: statement.id },
    });

    await recomputeTotals(tx, statement.id);
    return { ok: true, statementId: statement.id };
  });
}

type Tx = Parameters<Parameters<typeof systemDb>[0]>[0];

/** A draft's totals from the lines actually on it. */
async function recomputeTotals(tx: Tx, statementId: string) {
  const lines = await tx.commissionEntry.findMany({
    where: { statementId },
    select: { kind: true, commissionableTotal: true, commissionAmount: true },
  });
  const orders = lines.filter((l) => l.kind === "order");
  await tx.commissionStatement.update({
    where: { id: statementId },
    data: {
      orderCount: orders.length,
      grossOrders: orders.reduce((s, l) => s + l.commissionableTotal, 0),
      commissionDue: lines.reduce((s, l) => s + l.commissionAmount, 0),
    },
    select: { id: true },
  });
}

/**
 * Issue a draft: it is frozen from here on, and due in `dueDays`. Its totals
 * are recomputed first, in the same transaction, so a line disputed after the
 * draft was built never ends up on the issued figure.
 */
export async function issueStatement(statementId: string, dueDays = DEFAULT_DUE_DAYS, now = new Date()): Promise<Result> {
  const due = addDays(manilaDate(now), Math.max(0, Math.min(90, Math.trunc(dueDays))));
  return systemDb(async (tx) => {
    const s = await tx.commissionStatement.findFirst({ where: { id: statementId }, select: { status: true } });
    if (s?.status !== "draft") return { ok: false, error: "Only a draft can be issued." };
    await tx.commissionEntry.updateMany({ where: { statementId, state: { not: "confirmed" } }, data: { statementId: null } });
    await recomputeTotals(tx, statementId);
    const r = await tx.commissionStatement.updateMany({
      where: { id: statementId, status: "draft" },
      data: { status: "issued", issuedAt: now, dueAt: new Date(`${due}T00:00:00Z`) },
    });
    return r.count === 1 ? { ok: true } : { ok: false, error: "Only a draft can be issued." };
  });
}

/** Record a payment (GCash or bank). Full payment settles the statement and its lines. */
export async function recordStatementPayment(statementId: string, amount: number, now = new Date()): Promise<Result> {
  return systemDb(async (tx) => {
    const s = await tx.commissionStatement.findFirst({
      where: { id: statementId },
      select: { status: true, commissionDue: true, amountPaid: true },
    });
    if (!s) return { ok: false, error: "Statement not found." };
    const next = applyPayment(s, amount);
    if (!next.ok) return next;
    // Guarded on the amount read, so two payments recorded at once can't both land on stale figures.
    const r = await tx.commissionStatement.updateMany({
      where: { id: statementId, amountPaid: s.amountPaid, status: s.status },
      data: {
        amountPaid: next.amountPaid,
        status: next.status,
        ...(next.status === "paid" ? { paidAt: now } : {}),
      },
    });
    if (r.count !== 1) return { ok: false, error: "This statement just changed. Reload and try again." };
    if (next.status === "paid") {
      await tx.commissionEntry.updateMany({ where: { statementId }, data: { state: "settled" } });
    }
    return { ok: true };
  });
}

/** Write off an uncollectable balance, with the reason. */
export async function writeOffStatement(statementId: string, reason: string): Promise<Result> {
  const why = reason.trim();
  if (!why) return { ok: false, error: "Say why it's being written off." };
  const r = await systemDb((tx) =>
    tx.commissionStatement.updateMany({
      where: { id: statementId, status: { in: ["issued", "partially_paid"] } },
      data: { status: "written_off", writeOffReason: why.slice(0, 500) },
    }),
  );
  return r.count === 1 ? { ok: true } : { ok: false, error: "Only an issued, unpaid statement can be written off." };
}

/** A correction (plus or minus, centavos) that lands on the partner's next statement. */
export async function createAdjustment(partnerId: string, amount: number, note: string, now = new Date()): Promise<Result> {
  if (!Number.isInteger(amount) || amount === 0) return { ok: false, error: "Enter the adjustment amount." };
  const why = note.trim();
  if (!why) return { ok: false, error: "Say what the adjustment is for." };
  await systemDb((tx) =>
    tx.commissionEntry.create({
      data: {
        kind: "adjustment",
        territoryPartnerId: partnerId,
        orderTotal: 0,
        commissionableTotal: 0,
        rateBps: 0,
        commissionAmount: amount,
        state: "confirmed",
        note: why.slice(0, 500),
        orderedAt: now,
      },
      select: { id: true },
    }),
  );
  return { ok: true };
}

/** Outstanding issued statements — the collections queue. */
export async function outstandingStatements(): Promise<(AgingRow & { partnerName: string; territoryName: string; partnerId: string; periodStart: string; status: string })[]> {
  const rows = await systemDb((tx) =>
    tx.commissionStatement.findMany({
      where: { status: { in: ["issued", "partially_paid"] } },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        status: true,
        periodStart: true,
        dueAt: true,
        commissionDue: true,
        amountPaid: true,
        partner: {
          select: {
            id: true,
            restaurant: { select: { name: true, displayName: true } },
            territory: { select: { name: true } },
          },
        },
      },
    }),
  );
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    partnerId: r.partner.id,
    partnerName: r.partner.restaurant.displayName || r.partner.restaurant.name,
    territoryName: r.partner.territory.name,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    dueAt: r.dueAt ? r.dueAt.toISOString().slice(0, 10) : null,
    balance: Math.max(0, r.commissionDue - r.amountPaid),
  }));
}
