"use client";

import { useEffect, useState } from "react";
import { getTableBill, requestBill, type TableBill } from "@/server/orders/request-bill";
import { createTableCheckout } from "@/server/payments/checkout";

function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/**
 * The diner's bill, with a choice of how to pay:
 *   • Cash   → flag the cashier (a waiter comes to collect) + "on the way" note.
 *   • Online → hosted GCash/card checkout (PayMongo / Xendit).
 */
export function BillSheet({
  slug,
  tableToken,
  payOnline,
  onClose,
}: {
  slug: string;
  tableToken: string;
  payOnline: boolean;
  onClose: () => void;
}) {
  const [bill, setBill] = useState<TableBill | null | "loading">("loading");
  const [phase, setPhase] = useState<"choose" | "cash" | "redirecting">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTableBill({ slug, tableToken })
      .then((r) => setBill(r.ok && r.bill ? r.bill : null))
      .catch(() => setBill(null));
  }, [slug, tableToken]);

  async function payCash() {
    setBusy(true);
    setError(null);
    const res = await requestBill({ slug, tableToken, method: "cash" });
    setBusy(false);
    if (res.ok) setPhase("cash");
    else setError(res.error ?? "Couldn't notify the cashier.");
  }

  async function payOnlineNow() {
    setBusy(true);
    setError(null);
    await requestBill({ slug, tableToken, method: "online" });
    const res = await createTableCheckout({ slug, tableToken });
    if (res.ok && res.checkoutUrl) {
      setPhase("redirecting");
      window.location.href = res.checkoutUrl;
    } else {
      setBusy(false);
      setError(res.error ?? "Couldn't start online payment.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-ink/15" />

        {phase === "cash" ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
              🧑‍🍳
            </div>
            <h2 className="mt-4 font-heading text-xl font-bold text-brand-ink">A waiter is on the way</h2>
            <p className="mt-1 text-sm text-brand-ink/60">
              Someone will come to your table to collect your cash payment. Thank you!
            </p>
            <button onClick={onClose} className="mt-6 w-full rounded-full py-3 font-semibold btn-brand">
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-heading text-xl font-bold text-brand-ink">Your bill</h2>

            {bill === "loading" ? (
              <p className="py-6 text-center text-sm text-brand-ink/50">Loading…</p>
            ) : bill === null || bill.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-brand-ink/50">
                Nothing to pay right now.
              </p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-plum-ink/5">
                  {bill.items.map((it, i) => (
                    <li key={i} className="flex justify-between py-2 text-sm">
                      <span className="text-brand-ink">
                        {it.quantity}× {it.name}
                      </span>
                      <span className="font-semibold">{peso(it.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-plum-ink/10 pt-3 font-heading text-lg font-bold">
                  <span>Total</span>
                  <span>{peso(bill.total)}</span>
                </div>

                <p className="mt-5 text-center text-sm font-semibold text-brand-ink/70">How would you like to pay?</p>
                <div className="mt-3 space-y-2">
                  {payOnline && (
                    <button
                      onClick={payOnlineNow}
                      disabled={busy}
                      className="w-full rounded-full py-3 font-semibold text-white btn-brand disabled:opacity-60"
                    >
                      {phase === "redirecting" ? "Opening…" : "💳 Pay online (GCash / Card)"}
                    </button>
                  )}
                  <button
                    onClick={payCash}
                    disabled={busy}
                    className="w-full rounded-full border border-brand-ink/15 py-3 font-semibold text-brand-ink disabled:opacity-60"
                  >
                    💵 Pay with cash
                  </button>
                </div>
                {error && <p className="mt-2 text-center text-sm text-guava">{error}</p>}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
