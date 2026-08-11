"use client";

import { useMemo, useState } from "react";
import { formatPeso, pesosToCentavos } from "@/lib/money";
import type { CounterMethod } from "@/server/orders/cashier";

const METHODS: { key: CounterMethod; label: string }[] = [
  { key: "cash", label: "💵 Cash" },
  { key: "gcash", label: "📱 GCash" },
  { key: "maya", label: "🟢 Maya" },
  { key: "card_terminal", label: "💳 Card" },
];

/** Handy notes so the cashier can tap instead of typing. */
const QUICK = [20, 50, 100, 200, 500, 1000];

/**
 * Settles an order at the counter. Cash asks what the customer handed over and
 * shows the change to give back; the e-wallet/card methods settle straight
 * away (the customer has already scanned or tapped).
 */
export function PayModal({
  label,
  due,
  busy,
  initialMethod = "cash",
  onConfirm,
  onCancel,
}: {
  label: string; // e.g. "Table 5"
  due: number; // centavos still owed
  busy: boolean;
  initialMethod?: CounterMethod;
  onConfirm: (method: CounterMethod, change: number) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<CounterMethod>(initialMethod);
  const [tendered, setTendered] = useState("");

  const tenderedCentavos = useMemo(() => {
    const n = Number(tendered);
    return Number.isFinite(n) && n > 0 ? pesosToCentavos(n) : 0;
  }, [tendered]);

  const isCash = method === "cash";
  const change = tenderedCentavos - due;
  const short = isCash && tenderedCentavos > 0 && change < 0;
  // Cash needs enough handed over; the other methods are already settled.
  const canConfirm = !busy && (!isCash || tenderedCentavos >= due);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-plum-ink">Take payment</h2>
            <p className="text-sm text-plum-ink/55">{label}</p>
          </div>
          <button onClick={onCancel} aria-label="Close" className="text-2xl leading-none text-plum-ink/40">
            ×
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-cream/60 p-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">Amount due</p>
          <p className="font-heading text-3xl font-extrabold text-plum-ink">{formatPeso(due)}</p>
        </div>

        {/* Method */}
        <div className="mt-4 grid grid-cols-4 gap-1 rounded-lg bg-plum-ink/5 p-1">
          {METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              className={`rounded-md py-2 text-xs font-bold ${
                method === m.key ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/55"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {isCash ? (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Cash received</label>
            <div className="flex items-center gap-1">
              <span className="text-lg text-plum-ink/50">₱</span>
              <input
                autoFocus
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                placeholder="0.00"
                className="w-full rounded-lg border border-plum-ink/15 px-3 py-2.5 text-lg font-semibold tabular-nums"
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTendered(String(due / 100))}
                className="rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold"
              >
                Exact
              </button>
              {QUICK.filter((n) => n * 100 >= due).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTendered(String(n))}
                  className="rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold"
                >
                  ₱{n}
                </button>
              ))}
            </div>

            {/* Change (sukli) */}
            <div
              className={`mt-3 rounded-xl p-4 text-center ${
                short ? "bg-guava/10" : change > 0 ? "bg-green-50" : "bg-plum-ink/5"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
                {short ? "Still short" : "Change"}
              </p>
              <p
                className={`font-heading text-3xl font-extrabold ${
                  short ? "text-guava" : change > 0 ? "text-green-700" : "text-plum-ink"
                }`}
              >
                {formatPeso(Math.abs(change))}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-cream/60 px-3 py-2.5 text-center text-sm text-plum-ink/70">
            Have the customer scan or tap, then confirm once the payment shows on your side.
          </p>
        )}

        <button
          onClick={() => onConfirm(method, isCash ? Math.max(0, change) : 0)}
          disabled={!canConfirm}
          className="mt-4 w-full rounded-xl py-3.5 font-heading text-base font-bold btn-brand disabled:opacity-50"
        >
          {busy ? "Recording…" : `Confirm ${formatPeso(due)} paid`}
        </button>
      </div>
    </div>
  );
}
