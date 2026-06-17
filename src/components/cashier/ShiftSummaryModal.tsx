"use client";

import { useEffect, useState } from "react";
import { getShiftSummary, type ShiftSummary } from "@/server/orders/shift-summary";
import { formatPeso } from "@/lib/money";

/**
 * End-of-shift review: today's sales (by method), expenses and net — with a
 * button to print the summary and a reminder to clock out.
 */
export function ShiftSummaryModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<ShiftSummary | null | "loading">("loading");

  useEffect(() => {
    getShiftSummary().then(setS).catch(() => setS(null));
  }, []);

  const row = "flex justify-between py-1 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">End-of-shift summary</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>

        {s === "loading" ? (
          <p className="py-6 text-center text-sm text-plum-ink/50">Loading…</p>
        ) : s === null ? (
          <p className="py-6 text-center text-sm text-plum-ink/50">Couldn&apos;t load the summary.</p>
        ) : (
          <div className="overflow-y-auto">
            <p className="text-xs text-plum-ink/50">Today · {new Date(s.from).toLocaleDateString()}</p>

            <div className="mt-3 rounded-lg border border-plum-ink/10 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-plum-ink/40">Sales</p>
              <div className={row}><span className="text-plum-ink/60">Orders paid</span><span className="font-semibold">{s.orderCount}</span></div>
              {s.byMethod.map((m) => (
                <div key={m.label} className={row}>
                  <span className="text-plum-ink/60">{m.label} ({m.count})</span>
                  <span>{formatPeso(m.amount)}</span>
                </div>
              ))}
              {s.discounts > 0 && (
                <div className={row}><span className="text-plum-ink/60">Discounts</span><span className="text-guava">−{formatPeso(s.discounts)}</span></div>
              )}
              <div className={`${row} border-t border-plum-ink/10 font-bold`}><span>Gross sales</span><span>{formatPeso(s.gross)}</span></div>
            </div>

            <div className="mt-3 rounded-lg border border-plum-ink/10 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-plum-ink/40">Expenses</p>
              {s.expenses.length === 0 ? (
                <p className="py-1 text-sm text-plum-ink/50">None recorded today.</p>
              ) : (
                s.expenses.map((e, i) => (
                  <div key={i} className={row}>
                    <span className="text-plum-ink/60">{e.category}{e.note ? ` · ${e.note}` : ""}</span>
                    <span>{formatPeso(e.amount)}</span>
                  </div>
                ))
              )}
              <div className={`${row} border-t border-plum-ink/10 font-bold`}><span>Total expenses</span><span>{formatPeso(s.expensesTotal)}</span></div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-primary/5 p-3">
              <span className="font-heading font-bold text-brand-primary">Net</span>
              <span className="font-heading text-lg font-extrabold text-brand-primary">{formatPeso(s.net)}</span>
            </div>

            <div className="mt-4 flex gap-2">
              <a
                href="/cashier/shift-summary"
                target="_blank"
                rel="noopener"
                className="flex-1 rounded-full px-4 py-2.5 text-center text-sm font-semibold btn-brand"
              >
                🖨 Print summary
              </a>
              <a
                href="/clock/me"
                className="flex-1 rounded-full border border-plum-ink/15 px-4 py-2.5 text-center text-sm font-semibold hover:bg-cream"
              >
                Clock out →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
