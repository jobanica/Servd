"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getCashierTables,
  markOrderPaid,
  closeOrder,
  type CashierTable,
} from "@/server/orders/cashier";
import { formatPeso } from "@/lib/money";
import { PrintTicketButton } from "./PrintTicketButton";

export function CashierBoard({
  restaurantId,
  initialTables,
}: {
  restaurantId: string;
  initialTables: CashierTable[];
}) {
  const [tables, setTables] = useState<CashierTable[]>(initialTables);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTables(await getCashierTables());
    } catch {
      /* ignore transient */
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(refresh, 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  async function pay(orderId: string, method: "cash" | "card_terminal") {
    setBusy(orderId);
    const res = await markOrderPaid(orderId, method);
    setBusy(null);
    if (res.ok && res.tables) setTables(res.tables);
  }

  async function close(orderId: string) {
    setBusy(orderId);
    const res = await closeOrder(orderId);
    setBusy(null);
    if (res.ok && res.tables) setTables(res.tables);
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-plum-ink/50">
        <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
        {live ? "Live" : "Polling (realtime offline)"}
      </div>

      {tables.length === 0 && (
        <p className="text-sm text-plum-ink/40">No open tables right now.</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tables.map((t) => (
          <section
            key={t.tableId}
            className={`rounded-tile border bg-white p-4 ${
              t.billRequested ? "border-guava" : "border-plum-ink/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">
                Table {t.tableNumber}
              </h2>
              {t.billRequested && (
                <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-semibold text-guava">
                  Bill requested
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-plum-ink/60">
              Outstanding: <span className="font-semibold">{formatPeso(t.outstanding)}</span>
            </p>

            <ul className="mt-3 space-y-3">
              {t.orders.map((o) => (
                <li key={o.id} className="rounded-lg bg-cream/60 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {o.itemCount} item{o.itemCount > 1 ? "s" : ""} ·{" "}
                      <span className="text-plum-ink/50">{o.status}</span>
                    </span>
                    <span className="font-semibold">{formatPeso(o.total)}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    Payment:{" "}
                    <span
                      className={
                        o.paymentStatus === "paid" ? "text-mango" : "text-plum-ink/60"
                      }
                    >
                      {o.paymentStatus}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PrintTicketButton orderId={o.id} />
                    {o.paymentStatus !== "paid" && (
                      <>
                        <button
                          onClick={() => pay(o.id, "cash")}
                          disabled={busy === o.id}
                          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          Paid (cash)
                        </button>
                        <button
                          onClick={() => pay(o.id, "card_terminal")}
                          disabled={busy === o.id}
                          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          Paid (card)
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => close(o.id)}
                      disabled={busy === o.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold btn-brand disabled:opacity-60"
                    >
                      Close
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
