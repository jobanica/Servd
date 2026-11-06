import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import {
  addDays,
  allocatePayment,
  applyPayment,
  manilaDate,
  weekPeriod,
  type AgingRow,
} from "@/lib/neighborhood/commission";

/**
 * Weekly statements, due every Saturday. A Saturday's statement holds the
 * confirmed lines of the week before it (Saturday to Friday, Manila); the
 * Saturday run builds and issues it automatically. Payments are recorded
 * against it — by the founder, or from a partner's receipt once confirmed —
 * partial payments allowed; on full payment its entries are settled.
 *
 * An issued statement is never edited — its totals, period and lines are
 * frozen. A correction is an adjustment entry, which lands on the next one.
 */

export const DEFAULT_DUE_DAYS = 0;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Build (or rebuild) the draft for one partner and the week a Saturday bills.
 * Takes every CONFIRMED entry not yet on a statement and dated before that
 * Saturday — which also carries forward a line from an earlier week that was
 * disputed and only confirmed later. Disputed, pending, waived and cancelled
 * lines stay off it.
 */
export async function generateStatement(partnerId: string, dueSaturday: string): Promise<Result<{ statementId: string }>> {
  const period = weekPeriod(dueSaturday);
  if (!period) return { ok: false, error: "Choose a Saturday." };

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
      return { ok: false, error: "This week's statement is already issued. Corrections go in as an adjustment." };
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
 * Issue a draft: it is frozen from here on, and due on `dueOn` (its Saturday)
 * or in `dueDays`. Its totals are recomputed first, in the same transaction,
 * so a line disputed after the draft was built never ends up on the issued
 * figure.
 */
export async function issueStatement(
  statementId: string,
  opts: { dueOn?: string; dueDays?: number } = {},
  now = new Date(),
): Promise<Result> {
  const due =
    opts.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(opts.dueOn)
      ? opts.dueOn
      : addDays(manilaDate(now), Math.max(0, Math.min(90, Math.trunc(opts.dueDays ?? DEFAULT_DUE_DAYS))));
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

/**
 * The Saturday run: for every neighborhood partner, build the week's statement
 * and issue it due that Saturday. A week with nothing on it leaves no
 * statement behind.
 */
export async function runWeeklyStatements(dueSaturday: string, now = new Date()): Promise<{ issued: number; empty: number }> {
  const out = { issued: 0, empty: 0 };
  const partners = await systemDb((tx) =>
    tx.territoryPartner.findMany({
      where: { status: { in: ["active", "paused", "ended"] }, restaurant: { commercialTrack: "neighborhood" } },
      select: { id: true },
    }),
  );
  for (const p of partners) {
    const built = await generateStatement(p.id, dueSaturday).catch(() => null);
    if (!built?.ok) continue;
    const s = await systemDb((tx) =>
      tx.commissionStatement.findFirst({ where: { id: built.statementId }, select: { status: true, commissionDue: true, orderCount: true } }),
    );
    if (s?.status !== "draft") continue;
    if (s.commissionDue === 0 && s.orderCount === 0) {
      await systemDb(async (tx) => {
        await tx.commissionEntry.updateMany({ where: { statementId: built.statementId }, data: { statementId: null } });
        await tx.commissionStatement.deleteMany({ where: { id: built.statementId, status: "draft" } });
      });
      out.empty++;
      continue;
    }
    const issued = await issueStatement(built.statementId, { dueOn: dueSaturday }, now);
    if (issued.ok) out.issued++;
  }
  return out;
}

// ------------------------------------------------------------- partner payments

/**
 * Confirm a partner's uploaded payment: it's applied to their open statements
 * oldest first (settling each one it pays off), and anything left over is a
 * credit on the next statement. Only a submitted payment, once.
 */
export async function confirmCommissionPayment(paymentId: string, now = new Date()): Promise<Result> {
  return systemDb(async (tx) => {
    const pay = await tx.commissionPayment.findFirst({
      where: { id: paymentId },
      select: { id: true, status: true, amount: true, reference: true, territoryPartnerId: true },
    });
    if (!pay) return { ok: false, error: "Payment not found." };
    const claimed = await tx.commissionPayment.updateMany({
      where: { id: paymentId, status: "submitted" },
      data: { status: "confirmed", decidedAt: now, reason: null },
    });
    if (claimed.count !== 1) return { ok: false, error: "This payment was already decided." };

    const open = await tx.commissionStatement.findMany({
      where: { territoryPartnerId: pay.territoryPartnerId, status: { in: ["issued", "partially_paid"] } },
      orderBy: { periodStart: "asc" },
      select: { id: true, status: true, commissionDue: true, amountPaid: true },
    });
    const { applied, credit } = allocatePayment(pay.amount, open);
    for (const a of applied) {
      const st = open.find((o) => o.id === a.id)!;
      const next = applyPayment(st, a.amount);
      if (!next.ok) continue;
      await tx.commissionStatement.update({
        where: { id: st.id },
        data: { amountPaid: next.amountPaid, status: next.status, ...(next.status === "paid" ? { paidAt: now } : {}) },
        select: { id: true },
      });
      if (next.status === "paid") {
        await tx.commissionEntry.updateMany({ where: { statementId: st.id }, data: { state: "settled" } });
      }
    }
    if (credit > 0) {
      await tx.commissionEntry.create({
        data: {
          kind: "adjustment",
          territoryPartnerId: pay.territoryPartnerId,
          orderTotal: 0,
          commissionableTotal: 0,
          rateBps: 0,
          commissionAmount: -credit,
          state: "confirmed",
          note: `Credit — paid ahead${pay.reference ? ` (ref ${pay.reference})` : ""}`,
          orderedAt: now,
        },
        select: { id: true },
      });
    }
    return { ok: true };
  });
}

export async function rejectCommissionPayment(paymentId: string, reason: string, now = new Date()): Promise<Result> {
  const why = reason.trim();
  if (!why) return { ok: false, error: "Say why it's rejected, so the partner knows what to fix." };
  const r = await systemDb((tx) =>
    tx.commissionPayment.updateMany({
      where: { id: paymentId, status: "submitted" },
      data: { status: "rejected", reason: why.slice(0, 500), decidedAt: now },
    }),
  );
  return r.count === 1 ? { ok: true } : { ok: false, error: "This payment was already decided." };
}
