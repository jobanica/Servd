"use server";

import { revalidatePath } from "next/cache";

import { requireHrOwnerAction } from "@/server/hr/guard";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";
import { nextDeduction, validateAdvance, type AdvanceStatus } from "@/lib/hr/cash-advance";
import { listAdvances } from "@/server/hr/cash-advance";

/**
 * Recording and repaying cash advances.
 *
 * Owner-only throughout: this is money owed by a named person, and a manager
 * who can read it knows what colleagues borrowed.
 */

export type AdvanceState = { ok?: boolean; error?: string } | null;

const path = (employeeId: string) => `/admin/hr/${employeeId}`;

/** Record money handed over, and how much to take back each payday. */
export async function createCashAdvance(
  _prev: AdvanceState,
  formData: FormData,
): Promise<AdvanceState> {
  const { restaurantId } = await requireHrOwnerAction();
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const principalPesos = Number(formData.get("principalPesos"));
  const perPeriodPesos = Number(formData.get("perPeriodPesos"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 120) || null;
  if (!employeeId) return { error: "Missing employee." };

  const invalid = validateAdvance(principalPesos, perPeriodPesos);
  if (invalid) return { error: invalid };

  try {
    await tenantDb(restaurantId, (tx) =>
      tx.cashAdvance.create({
        data: {
          restaurantId,
          employeeId,
          principal: pesosToCentavos(principalPesos),
          perPeriod: pesosToCentavos(perPeriodPesos),
          note,
          status: "active",
        },
        select: { id: true },
      }),
    );
  } catch {
    return { error: "Run prisma/manual/add-cash-advances.sql, then try again." };
  }
  revalidatePath(path(employeeId));
  return { ok: true };
}

/**
 * Take this payday's instalment.
 *
 * The amount is worked out here, not sent from the form: it is capped at the
 * balance so the final one collects exactly what is left, and a page showing a
 * stale figure can't talk the server into over-collecting. Passing an amount is
 * allowed for a part payment, but it is capped the same way.
 */
export async function recordAdvanceRepayment(
  _prev: AdvanceState,
  formData: FormData,
): Promise<AdvanceState> {
  const { restaurantId } = await requireHrOwnerAction();
  const advanceId = String(formData.get("advanceId") ?? "").trim();
  const dateRaw = String(formData.get("appliedOn") ?? "").trim();
  const overridePesos = Number(formData.get("amountPesos"));
  if (!advanceId) return { error: "Missing advance." };

  const appliedOn = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? new Date(`${dateRaw}T12:00:00`)
    : new Date();
  if (Number.isNaN(appliedOn.getTime())) return { error: "That date isn't valid." };

  let employeeId = "";
  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.cashAdvance.findFirst({
        where: { id: advanceId },
        select: { id: true, employeeId: true, principal: true, perPeriod: true, status: true },
      }),
    );
    if (!row) return { error: "That advance no longer exists." };
    employeeId = row.employeeId;

    const all = await listAdvances(restaurantId, row.employeeId);
    const live = all.find((a) => a.id === advanceId);
    if (!live) return { error: "Couldn't read the balance." };
    if (live.status !== "active") {
      return { error: `This advance is ${live.status}. Resume it first.` };
    }

    const scheduled = nextDeduction(
      { principal: row.principal, perPeriod: row.perPeriod, status: "active" },
      live.repaid,
    );
    // A hand-typed amount still cannot exceed what is owed.
    const wanted =
      Number.isFinite(overridePesos) && overridePesos > 0
        ? Math.min(pesosToCentavos(overridePesos), live.outstanding)
        : scheduled;

    if (wanted <= 0) return { error: "Nothing left to deduct on this advance." };

    await tenantDb(restaurantId, async (tx) => {
      await tx.payrollDeduction.create({
        data: {
          restaurantId,
          employeeId: row.employeeId,
          label: "Cash advance",
          amount: wanted,
          appliedOn,
          advanceId,
        },
        select: { id: true },
      });
      // Close it the moment nothing is left, so it stops offering a deduction
      // rather than relying on whoever is looking to notice it hit zero.
      if (live.outstanding - wanted <= 0) {
        await tx.cashAdvance.update({
          where: { id: advanceId },
          data: { status: "settled", settledAt: new Date() },
          select: { id: true },
        });
      }
    });
  } catch {
    return { error: "Couldn't record the repayment." };
  }

  revalidatePath(path(employeeId));
  revalidatePath("/admin/hr/payroll");
  return { ok: true };
}

/** Pause, resume, or write off. */
export async function setAdvanceStatus(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrOwnerAction();
  const advanceId = String(formData.get("advanceId") ?? "").trim();
  const next = String(formData.get("status") ?? "") as AdvanceStatus;
  if (!advanceId || !["active", "paused", "cancelled"].includes(next)) return;

  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.cashAdvance.findFirst({ where: { id: advanceId }, select: { employeeId: true } }),
    );
    if (!row) return;
    await tenantDb(restaurantId, (tx) =>
      tx.cashAdvance.update({
        where: { id: advanceId },
        data: { status: next, ...(next === "cancelled" ? { settledAt: new Date() } : {}) },
        select: { id: true },
      }),
    );
    revalidatePath(path(row.employeeId));
  } catch {
    /* not migrated — nothing to change */
  }
}

/**
 * Undo a repayment.
 *
 * Deletes the deduction and reopens the advance if that was the one that closed
 * it — otherwise correcting a mistyped instalment would leave a settled loan
 * with money still owed on it.
 */
export async function undoAdvanceRepayment(formData: FormData): Promise<void> {
  const { restaurantId } = await requireHrOwnerAction();
  const deductionId = String(formData.get("deductionId") ?? "").trim();
  if (!deductionId) return;

  try {
    const row = await tenantDb(restaurantId, (tx) =>
      tx.payrollDeduction.findFirst({
        where: { id: deductionId },
        select: { id: true, employeeId: true, advanceId: true },
      }),
    );
    if (!row) return;
    await tenantDb(restaurantId, async (tx) => {
      await tx.payrollDeduction.delete({ where: { id: deductionId } });
      if (row.advanceId) {
        await tx.cashAdvance.updateMany({
          where: { id: row.advanceId, status: "settled" },
          data: { status: "active", settledAt: null },
        });
      }
    });
    revalidatePath(path(row.employeeId));
    revalidatePath("/admin/hr/payroll");
  } catch {
    /* nothing to undo */
  }
}
