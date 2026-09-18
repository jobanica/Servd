"use client";

import { useActionState } from "react";
import {
  createCashAdvance,
  recordAdvanceRepayment,
  setAdvanceStatus,
  undoAdvanceRepayment,
  type AdvanceState,
} from "@/server/hr/cash-advance-actions";
import { formatPeso } from "@/lib/money";
import type { AdvanceRow } from "@/server/hr/cash-advance";

const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

function StatusChip({ status }: { status: AdvanceRow["status"] }) {
  const tone =
    status === "active"
      ? "bg-brand-primary/10 text-brand-primary"
      : status === "paused"
        ? "bg-mango/20 text-plum-ink/70"
        : "bg-plum-ink/10 text-plum-ink/50";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${tone}`}>
      {status}
    </span>
  );
}

function Advance({ a }: { a: AdvanceRow }) {
  const [payState, payAction, paying] = useActionState<AdvanceState, FormData>(
    recordAdvanceRepayment,
    null,
  );
  const live = a.status === "active" || a.status === "paused";

  return (
    <li className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-heading text-lg font-bold">{formatPeso(a.outstanding)}</span>
          <span className="text-sm text-plum-ink/50"> still owed</span>
          <span className="block text-xs text-plum-ink/45">
            {formatPeso(a.principal)} advance · {formatPeso(a.perPeriod)} per payday
            {a.note ? ` · ${a.note}` : ""}
          </span>
        </div>
        <StatusChip status={a.status} />
      </div>

      {/* Progress: the question is always "how much more", so show it. */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-plum-ink/10">
        <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${a.percent}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-plum-ink/45">
        {formatPeso(a.repaid)} of {formatPeso(a.principal)} repaid ({a.percent}%)
        {a.status === "active" && a.periodsLeft != null && a.periodsLeft > 0
          ? ` · about ${a.periodsLeft} more payday${a.periodsLeft === 1 ? "" : "s"}`
          : ""}
      </p>

      {a.status === "active" && a.nextAmount > 0 && (
        <form action={payAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="advanceId" value={a.id} />
          <label className="text-xs font-semibold text-plum-ink/55">
            Deduct
            <input
              name="amountPesos"
              type="number"
              step="0.01"
              min="0"
              defaultValue={(a.nextAmount / 100).toFixed(2)}
              className={`${field} w-28`}
            />
          </label>
          <label className="text-xs font-semibold text-plum-ink/55">
            Payday
            <input name="appliedOn" type="date" defaultValue={today()} className={`${field} w-40`} />
          </label>
          <button
            disabled={paying}
            className="rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {paying ? "Recording…" : "Record repayment"}
          </button>
          {a.nextAmount < a.perPeriod && (
            <span className="text-[11px] font-semibold text-brand-primary">
              Last one — only {formatPeso(a.nextAmount)} left.
            </span>
          )}
          {payState?.error && <span className="text-xs text-guava">{payState.error}</span>}
        </form>
      )}

      {live && (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={setAdvanceStatus}>
            <input type="hidden" name="advanceId" value={a.id} />
            <input type="hidden" name="status" value={a.status === "active" ? "paused" : "active"} />
            <button className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream">
              {a.status === "active" ? "Pause deductions" : "Resume deductions"}
            </button>
          </form>
          <form action={setAdvanceStatus}>
            <input type="hidden" name="advanceId" value={a.id} />
            <input type="hidden" name="status" value="cancelled" />
            <button className="rounded-full border border-guava/30 px-3 py-1.5 text-xs font-semibold text-guava hover:bg-guava/5">
              Write off the rest
            </button>
          </form>
        </div>
      )}

      {a.repayments.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-plum-ink/55">
            {a.repayments.length} repayment{a.repayments.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {a.repayments.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-plum-ink/60">{r.appliedOn.slice(0, 10)}</span>
                <span className="font-semibold">{formatPeso(r.amount)}</span>
                <form action={undoAdvanceRepayment}>
                  <input type="hidden" name="deductionId" value={r.id} />
                  <button className="text-plum-ink/40 underline hover:text-guava">undo</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/**
 * Cash advances for one employee. Owner-only — the page decides that; this
 * component is only rendered when they may see it.
 */
export function CashAdvancePanel({
  employeeId,
  advances,
}: {
  employeeId: string;
  advances: AdvanceRow[];
}) {
  const [state, action, pending] = useActionState<AdvanceState, FormData>(createCashAdvance, null);
  const owing = advances
    .filter((a) => a.status === "active" || a.status === "paused")
    .reduce((s, a) => s + a.outstanding, 0);

  return (
    <div className="space-y-3 rounded-tile border border-plum-ink/10 bg-cream/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">Cash advances</h2>
        {owing > 0 && (
          <span className="text-sm font-semibold text-plum-ink/70">
            {formatPeso(owing)} outstanding
          </span>
        )}
      </div>
      <p className="text-sm text-plum-ink/55">
        Record what you handed over and how much to take each payday. The deduction
        appears on payroll like any other, and the last one only takes what&apos;s left.
      </p>

      <form action={action} className="grid gap-2 sm:grid-cols-4">
        <input type="hidden" name="employeeId" value={employeeId} />
        <label className="text-xs font-semibold text-plum-ink/55">
          Advance (₱)
          <input name="principalPesos" type="number" step="0.01" min="0" required className={field} />
        </label>
        <label className="text-xs font-semibold text-plum-ink/55">
          Per payday (₱)
          <input name="perPeriodPesos" type="number" step="0.01" min="0" required className={field} />
        </label>
        <label className="text-xs font-semibold text-plum-ink/55 sm:col-span-2">
          Note (optional)
          <input name="note" placeholder="e.g. tuition, emergency" className={field} />
        </label>
        <div className="sm:col-span-4">
          <button
            disabled={pending}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Record advance"}
          </button>
          {state?.error && <span className="ml-2 text-sm text-guava">{state.error}</span>}
        </div>
      </form>

      {advances.length > 0 ? (
        <ul className="space-y-3">
          {advances.map((a) => (
            <Advance key={a.id} a={a} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-plum-ink/40">No advances recorded.</p>
      )}
    </div>
  );
}
