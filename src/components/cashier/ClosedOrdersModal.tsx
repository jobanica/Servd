"use client";

import { useEffect, useState } from "react";
import {
  getClosedOrders,
  getVoidedOrders,
  reopenOrder,
  type ClosedOrder,
  type VoidedOrder,
  type CashierTable,
} from "@/server/orders/cashier";
import { formatPeso } from "@/lib/money";

/** Lists today's closed orders and lets the cashier re-open any of them. */
export function ClosedOrdersModal({
  onClose,
  onReopened,
}: {
  onClose: () => void;
  onReopened: (tables: CashierTable[]) => void;
}) {
  const [orders, setOrders] = useState<ClosedOrder[] | null>(null);
  const [voided, setVoided] = useState<VoidedOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getClosedOrders().then(setOrders).catch(() => setOrders([]));
    getVoidedOrders().then(setVoided).catch(() => setVoided([]));
  }, []);

  async function reopen(id: string) {
    setBusy(id);
    try {
      const res = await reopenOrder(id);
      if (res.ok) {
        if (res.tables) onReopened(res.tables);
        setOrders(res.closed ?? orders?.filter((o) => o.id !== id) ?? null);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Closed &amp; voided — today</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>

        <div className="-mx-1 space-y-4 overflow-y-auto px-1">
          {/* Closed orders */}
          <div className="space-y-2">
            {orders === null ? (
              <p className="py-6 text-center text-sm text-plum-ink/50">Loading…</p>
            ) : orders.length === 0 ? (
              <p className="py-4 text-center text-sm text-plum-ink/50">No closed orders today.</p>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-plum-ink/10 p-3">
                  <div>
                    <p className="font-medium">{o.label}</p>
                    <p className="text-xs text-plum-ink/50">
                      {formatPeso(o.total)} · {o.paymentStatus === "paid" ? "paid" : "unpaid"} ·{" "}
                      {new Date(o.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <button
                    onClick={() => reopen(o.id)}
                    disabled={busy === o.id}
                    className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream disabled:opacity-60"
                  >
                    {busy === o.id ? "…" : "Re-open"}
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Voided today */}
          {voided.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-guava">
                Voided today ({voided.length})
              </p>
              <div className="space-y-2">
                {voided.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border border-guava/30 bg-guava/5 p-3">
                    <div>
                      <p className="font-medium">{v.label}</p>
                      <p className="text-xs text-plum-ink/50">
                        {formatPeso(v.total)} ·{" "}
                        {new Date(v.voidedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-semibold text-guava">
                      voided
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
