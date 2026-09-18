import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import {
  isFullyRepaid,
  nextDeduction,
  outstanding,
  percentRepaid,
  periodsRemaining,
  type AdvanceStatus,
} from "@/lib/hr/cash-advance";

/**
 * Cash advances and what is still owed on them.
 *
 * The balance is derived from the repayments rather than stored on the advance.
 * A stored running total is one failed write away from disagreeing with the
 * deductions that actually came off someone's pay, and the deductions are the
 * ones the staff member can see on their payslip — so those have to be the
 * truth.
 */

export interface AdvanceRepayment {
  id: string;
  amount: number;
  appliedOn: string;
  label: string;
}

export interface AdvanceRow {
  id: string;
  employeeId: string;
  principal: number;
  perPeriod: number;
  status: AdvanceStatus;
  note: string | null;
  createdAt: string;
  settledAt: string | null;
  /** Sum of the deductions pointing at this advance. */
  repaid: number;
  outstanding: number;
  percent: number;
  /** What the next cutoff would take — already capped at the balance. */
  nextAmount: number;
  /** Paydays left at this rate, or null when nothing is being taken. */
  periodsLeft: number | null;
  repayments: AdvanceRepayment[];
}

/**
 * Every advance for one employee, newest first.
 *
 * Best-effort: a database without the table just has no advances, and the HR
 * profile must still render — it was doing so long before this existed.
 */
export async function listAdvances(
  restaurantId: string,
  employeeId: string,
): Promise<AdvanceRow[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.cashAdvance.findMany({
        where: { employeeId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          employeeId: true,
          principal: true,
          perPeriod: true,
          status: true,
          note: true,
          createdAt: true,
          settledAt: true,
          repayments: {
            orderBy: { appliedOn: "asc" },
            select: { id: true, amount: true, appliedOn: true, label: true },
          },
        },
      }),
    );

    return rows.map((r) => {
      const repaid = r.repayments.reduce((s, d) => s + d.amount, 0);
      const status = r.status as AdvanceStatus;
      const advance = { principal: r.principal, perPeriod: r.perPeriod, status };
      return {
        id: r.id,
        employeeId: r.employeeId,
        principal: r.principal,
        perPeriod: r.perPeriod,
        status,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        settledAt: r.settledAt ? r.settledAt.toISOString() : null,
        repaid,
        outstanding: outstanding(r.principal, repaid),
        percent: percentRepaid(r.principal, repaid),
        nextAmount: nextDeduction(advance, repaid),
        periodsLeft: periodsRemaining(advance, repaid),
        repayments: r.repayments.map((d) => ({
          id: d.id,
          amount: d.amount,
          appliedOn: d.appliedOn.toISOString(),
          label: d.label,
        })),
      };
    });
  } catch {
    return []; // table not migrated here
  }
}

/** Total still owed across every live advance — shown on the employee header. */
export async function totalOutstanding(
  restaurantId: string,
  employeeId: string,
): Promise<number> {
  const rows = await listAdvances(restaurantId, employeeId);
  return rows
    .filter((r) => r.status === "active" || r.status === "paused")
    .reduce((s, r) => s + r.outstanding, 0);
}

/** One advance with its balance, or null. */
export async function getAdvance(
  restaurantId: string,
  id: string,
): Promise<AdvanceRow | null> {
  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.cashAdvance.findFirst({ where: { id }, select: { employeeId: true } }),
    );
    if (!row) return null;
    const all = await listAdvances(restaurantId, row.employeeId);
    return all.find((a) => a.id === id) ?? null;
  } catch {
    return null;
  }
}

/** Settled the moment nothing is left, so it stops appearing by itself. */
export function shouldSettle(principal: number, repaid: number): boolean {
  return isFullyRepaid(principal, repaid);
}
