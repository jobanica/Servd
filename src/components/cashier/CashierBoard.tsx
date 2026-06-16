"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getCashierTables,
  getIncomingOrders,
  acceptOrder,
  declineOrder,
  markOrderPaid,
  closeOrder,
  type CashierTable,
  type IncomingOrder,
} from "@/server/orders/cashier";
import { formatPeso } from "@/lib/money";
import { chime } from "@/lib/sound";
import { PrintTicketButton } from "./PrintTicketButton";
import { NewOrderModal } from "./NewOrderModal";

export function CashierBoard({
  restaurantId,
  initialTables,
  initialIncoming = [],
}: {
  restaurantId: string;
  initialTables: CashierTable[];
  initialIncoming?: IncomingOrder[];
}) {
  const [tables, setTables] = useState<CashierTable[]>(initialTables);
  const [incoming, setIncoming] = useState<IncomingOrder[]>(initialIncoming);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [popupDismissed, setPopupDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Track what we've already seen so we can chime on genuinely new arrivals.
  const seenIncoming = useRef<Set<string>>(new Set(initialIncoming.map((o) => o.id)));
  const seenOnlinePaid = useRef<Set<string>>(new Set());

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 6000);
  }

  const refresh = useCallback(async () => {
    try {
      const [t, inc] = await Promise.all([getCashierTables(), getIncomingOrders()]);

      // New incoming QR orders → chime + reopen the popup.
      const freshIncoming = inc.filter((o) => !seenIncoming.current.has(o.id));
      if (freshIncoming.length > 0) {
        chime();
        setPopupDismissed(false);
        showToast(`New order from Table ${freshIncoming[0].tableNumber}`);
      }
      seenIncoming.current = new Set(inc.map((o) => o.id));

      // New confirmed ONLINE payments → alert the cashier to verify the gateway.
      for (const tbl of t) {
        for (const o of tbl.orders) {
          if (o.paidOnline && !seenOnlinePaid.current.has(o.id)) {
            seenOnlinePaid.current.add(o.id);
            chime();
            showToast(`💳 Online payment received — Table ${tbl.tableNumber}. Verify it in your gateway.`);
          }
        }
      }

      setTables(t);
      setIncoming(inc);
    } catch {
      /* ignore transient */
    }
  }, []);

  useEffect(() => {
    // Seed the online-paid set from the initial data (don't alert on first load).
    for (const tbl of initialTables) {
      for (const o of tbl.orders) if (o.paidOnline) seenOnlinePaid.current.add(o.id);
    }
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
  }, [restaurantId, refresh, initialTables]);

  async function accept(orderId: string) {
    setBusy(orderId);
    const res = await acceptOrder(orderId);
    setBusy(null);
    if (res.ok) {
      if (res.incoming) {
        seenIncoming.current = new Set(res.incoming.map((o) => o.id));
        setIncoming(res.incoming);
      }
      if (res.tables) setTables(res.tables);
    }
  }

  async function decline(orderId: string) {
    setBusy(orderId);
    const res = await declineOrder(orderId);
    setBusy(null);
    if (res.ok) {
      if (res.incoming) {
        seenIncoming.current = new Set(res.incoming.map((o) => o.id));
        setIncoming(res.incoming);
      }
      if (res.tables) setTables(res.tables);
    }
  }

  async function pay(orderId: string, method: "cash" | "card_terminal") {
    setBusy(orderId);
    try {
      const res = await markOrderPaid(orderId, method);
      if (res.ok && res.tables) {
        setTables(res.tables);
        showToast("Payment recorded — order closed.");
      } else if (!res.ok) {
        showToast(res.error ?? "Couldn't record the payment.");
        refresh();
      }
    } catch {
      showToast("Something went wrong. Please try again.");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function close(orderId: string) {
    setBusy(orderId);
    try {
      const res = await closeOrder(orderId);
      if (res.ok && res.tables) setTables(res.tables);
      else if (!res.ok) {
        showToast(res.error ?? "Couldn't close the order.");
        refresh();
      }
    } catch {
      showToast("Something went wrong. Please try again.");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  const showPopup = incoming.length > 0 && !popupDismissed;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-plum-ink/50">
          <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
          {live ? "Live" : "Polling (realtime offline)"}
        </div>
        <div className="flex items-center gap-2">
          {incoming.length > 0 && (
            <button
              onClick={() => setPopupDismissed(false)}
              className="rounded-full border border-guava bg-guava/10 px-4 py-2 text-sm font-semibold text-guava"
            >
              {incoming.length} incoming
            </button>
          )}
          <button
            onClick={() => setNewOrderOpen(true)}
            className="rounded-full px-4 py-2 text-sm font-semibold btn-brand"
          >
            + New order
          </button>
        </div>
      </div>

      {tables.length === 0 && incoming.length === 0 && (
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
              <h2 className="font-heading text-lg font-extrabold">Table {t.tableNumber}</h2>
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
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span>
                      Payment:{" "}
                      <span className={o.paymentStatus === "paid" ? "text-mango" : "text-plum-ink/60"}>
                        {o.paymentStatus}
                      </span>
                    </span>
                    {o.paidOnline && (
                      <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 font-semibold text-brand-primary">
                        💳 Paid online — verify in gateway
                      </span>
                    )}
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
                      {o.paymentStatus === "paid" ? "Done" : "Close"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Incoming-order popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">
                {incoming.length === 1
                  ? "Incoming order"
                  : `${incoming.length} incoming orders`}
              </h2>
              <button
                onClick={() => setPopupDismissed(true)}
                className="text-sm font-semibold text-plum-ink/50"
              >
                View board
              </button>
            </div>
            <p className="mt-1 text-sm text-plum-ink/55">
              A customer placed an order via QR. Accept it to send it to the kitchen.
            </p>

            <ul className="mt-4 space-y-3">
              {incoming.map((o) => (
                <li key={o.id} className="rounded-lg border border-guava/40 bg-guava/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold">Table {o.tableNumber}</span>
                    <span className="font-semibold">{formatPeso(o.total)}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-plum-ink/75">
                    {o.items.map((it, i) => (
                      <li key={i}>
                        {it.quantity}× {it.name}
                        {it.modifiers.length > 0 && (
                          <span className="text-plum-ink/45"> · {it.modifiers.join(", ")}</span>
                        )}
                        {it.note && <span className="italic text-plum-ink/45"> · “{it.note}”</span>}
                      </li>
                    ))}
                  </ul>
                  {o.paymentStatus === "paid" && (
                    <p className="mt-1 text-xs font-semibold text-mango">Already paid online</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => accept(o.id)}
                      disabled={busy === o.id}
                      className="flex-1 rounded-full py-2 text-sm font-semibold btn-brand disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => decline(o.id)}
                      disabled={busy === o.id}
                      className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-plum-ink px-5 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {newOrderOpen && (
        <NewOrderModal
          onClose={() => setNewOrderOpen(false)}
          onCreated={(t) => setTables(t)}
        />
      )}
    </div>
  );
}
