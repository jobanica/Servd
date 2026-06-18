"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getCashierTables,
  getIncomingOrders,
  acceptOrder,
  declineOrder,
  markOrderPaid,
  markServed,
  closeOrder,
  type CashierTable,
  type IncomingOrder,
} from "@/server/orders/cashier";
import { formatPeso } from "@/lib/money";
import { chime } from "@/lib/sound";
import { PrintTicketButton } from "./PrintTicketButton";
import { NewOrderModal } from "./NewOrderModal";
import { DiscountModal } from "./DiscountModal";
import { LoyaltyRedeemModal } from "./LoyaltyRedeemModal";
import { AddCustomerModal } from "./AddCustomerModal";
import { ClosedOrdersModal } from "./ClosedOrdersModal";
import { ShiftSummaryModal } from "./ShiftSummaryModal";
import { VoidPinModal } from "./VoidPinModal";
import { CashOutModal } from "./CashOutModal";
import { BluetoothPrinterButton } from "./BluetoothPrinterButton";
import { printReceiptInBackground } from "@/lib/print/receipt-print";
import { getReceiptEscPos, printOrderTicket } from "@/server/printing/print";
import { isPrinterConnected, printBytes, base64ToBytes } from "@/lib/printing/bt-printer";
import { printViaBluetooth } from "@/lib/printing/bluetooth";

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
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [closedOpen, setClosedOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [voidOrderTarget, setVoidOrderTarget] = useState<{ id: string; label: string } | null>(null);
  const [discountOrder, setDiscountOrder] = useState<CashierTable["orders"][number] | null>(null);
  const [loyaltyOrderId, setLoyaltyOrderId] = useState<string | null>(null);
  const [waiterCalls, setWaiterCalls] = useState<{ id: string; tableNumber: string }[]>([]);
  const [popupDismissed, setPopupDismissed] = useState(false);
  const [readyDismissed, setReadyDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Track what we've already seen so we can chime on genuinely new arrivals.
  const seenIncoming = useRef<Set<string>>(new Set(initialIncoming.map((o) => o.id)));
  const seenOnlinePaid = useRef<Set<string>>(new Set());
  const seenReady = useRef<Set<string>>(new Set());

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
      // Newly READY orders (kitchen pressed "Mark ready") → chime + serve popup.
      let freshReady = false;
      for (const tbl of t) {
        for (const o of tbl.orders) {
          if (o.paidOnline && !seenOnlinePaid.current.has(o.id)) {
            seenOnlinePaid.current.add(o.id);
            chime();
            showToast(`💳 Online payment received — Table ${tbl.tableNumber}. Verify it in your gateway.`);
          }
          if (o.status === "done" && !o.served && !seenReady.current.has(o.id)) {
            seenReady.current.add(o.id);
            freshReady = true;
            chime();
            showToast(`🍽️ Food ready for Table ${tbl.tableNumber}`);
          }
        }
      }
      if (freshReady) setReadyDismissed(false);

      setTables(t);
      setIncoming(inc);
    } catch {
      /* ignore transient */
    }
  }, []);

  useEffect(() => {
    // Seed the seen sets from the initial data (don't alert on first load).
    for (const tbl of initialTables) {
      for (const o of tbl.orders) {
        if (o.paidOnline) seenOnlinePaid.current.add(o.id);
        if (o.status === "done" && !o.served) seenReady.current.add(o.id);
      }
    }
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .on("broadcast", { event: "waiter" }, (msg) => {
        const tableNumber = String(
          (msg as { payload?: { tableNumber?: string } }).payload?.tableNumber ?? "—",
        );
        chime();
        setToast(`🔔 Table ${tableNumber} is calling a waiter`);
        setWaiterCalls((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tableNumber },
        ]);
      })
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

  // Print the receipt after a successful payment, mirroring the (working)
  // "Print ticket" button so behaviour is identical.
  async function printPaidReceipt(orderId: string, clientPrintNeeded?: boolean) {
    // 1. A persistently-connected Bluetooth printer prints silently.
    if (isPrinterConnected()) {
      try {
        const b64 = await getReceiptEscPos(orderId);
        if (b64) {
          await printBytes(base64ToBytes(b64));
          return;
        }
      } catch {
        showToast("Couldn't reach the Bluetooth printer — check it's on.");
      }
    }
    // 2. Otherwise use the configured print method — same path as Print ticket.
    try {
      const res = await printOrderTicket(orderId);
      if (res.handledOnServer) return; // network/cloud printed server-side
      if (res.clientAction === "bluetooth" && res.ticketBase64) {
        await printViaBluetooth(base64ToBytes(res.ticketBase64));
        return;
      }
    } catch {
      /* fall through to OS print */
    }
    // 3. OS / kiosk fallback — hidden iframe (never a visible tab).
    if (clientPrintNeeded) printReceiptInBackground(orderId);
  }

  async function pay(orderId: string, method: "cash" | "card_terminal") {
    setBusy(orderId);
    try {
      const res = await markOrderPaid(orderId, method);
      if (res.ok && res.tables) {
        setTables(res.tables);
        showToast("Payment recorded — order closed.");
        await printPaidReceipt(orderId, res.printTicket);
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

  async function serve(orderId: string) {
    setBusy(orderId);
    try {
      const res = await markServed(orderId);
      if (res.ok && res.tables) {
        setTables(res.tables);
        showToast("Marked as served.");
      } else if (!res.ok) {
        showToast(res.error ?? "Couldn't mark as served.");
        refresh();
      }
    } catch {
      showToast("Something went wrong. Please try again.");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  // Orders the kitchen finished that haven't been served yet.
  const readyOrders = tables.flatMap((t) =>
    t.orders
      .filter((o) => o.status === "done" && !o.served)
      .map((o) => ({ ...o, tableNumber: t.tableNumber })),
  );

  const showPopup = incoming.length > 0 && !popupDismissed;
  const showReady = readyOrders.length > 0 && !readyDismissed && !showPopup;

  const sidebarBtn =
    "w-full rounded-full border border-plum-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-plum-ink hover:bg-cream";

  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      {/* Left action sidebar */}
      <aside className="flex shrink-0 flex-col gap-2 sm:sticky sm:top-4 sm:w-52 sm:self-start">
        <div className="mb-1 flex items-center gap-2 px-1 text-xs text-plum-ink/50">
          <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
          {live ? "Live" : "Polling (offline)"}
        </div>

        <button onClick={() => setNewOrderOpen(true)} className="w-full rounded-full px-4 py-2.5 text-sm font-semibold btn-brand">
          + New order
        </button>
        <button onClick={() => setAddCustomerOpen(true)} className={sidebarBtn}>
          + Customer
        </button>
        <BluetoothPrinterButton />

        {incoming.length > 0 && (
          <button
            onClick={() => setPopupDismissed(false)}
            className="w-full rounded-full border border-guava bg-guava/10 px-4 py-2.5 text-sm font-semibold text-guava"
          >
            {incoming.length} incoming
          </button>
        )}
        {readyOrders.length > 0 && (
          <button
            onClick={() => setReadyDismissed(false)}
            className="w-full rounded-full border border-mango bg-mango/10 px-4 py-2.5 text-sm font-semibold text-mango"
          >
            🍽️ {readyOrders.length} ready
          </button>
        )}

        <div className="my-1 border-t border-plum-ink/10" />

        <button onClick={() => setClosedOpen(true)} className={sidebarBtn}>Closed orders</button>
        <button onClick={() => setCashOutOpen(true)} className={sidebarBtn}>Cash out</button>
        <button onClick={() => setShiftOpen(true)} className={sidebarBtn}>End-of-shift summary</button>
      </aside>

      {/* Main board */}
      <div className="min-w-0 flex-1">
        {tables.length === 0 && incoming.length === 0 && (
          <p className="text-sm text-plum-ink/40">No open tables right now.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((t) => (
          <section
            key={t.tableId}
            className={`rounded-tile border bg-white p-4 ${
              t.billRequested ? "border-guava" : "border-plum-ink/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">{t.label}</h2>
              {t.billRequested && (
                <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-semibold text-guava">
                  Bill requested
                </span>
              )}
            </div>
            {(t.customerPhone || t.customerAddress || t.mapUrl) && (
              <p className="mt-0.5 text-xs text-plum-ink/50">
                {[t.customerPhone, t.customerAddress].filter(Boolean).join(" · ")}
                {t.mapUrl && (
                  <>
                    {(t.customerPhone || t.customerAddress) ? " · " : ""}
                    <a href={t.mapUrl} target="_blank" rel="noopener" className="font-semibold text-brand-primary underline">📍 Map</a>
                  </>
                )}
              </p>
            )}
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
                    {o.discountAmount > 0 ? (
                      <span className="text-right">
                        <span className="block text-xs text-plum-ink/40 line-through">{formatPeso(o.total)}</span>
                        <span className="font-semibold">{formatPeso(o.net)}</span>
                      </span>
                    ) : (
                      <span className="font-semibold">{formatPeso(o.total)}</span>
                    )}
                  </div>
                  {o.discountAmount > 0 && (
                    <p className="mt-0.5 text-xs font-semibold text-guava">
                      {o.discountLabel ?? "Discount"} · −{formatPeso(o.discountAmount)}
                    </p>
                  )}
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
                    {o.status === "done" && !o.served && (
                      <span className="rounded-full bg-mango/15 px-2 py-0.5 font-semibold text-mango">
                        🍽️ Ready to serve
                      </span>
                    )}
                    {o.served && (
                      <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 font-semibold text-plum-ink/50">
                        ✓ Served
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PrintTicketButton orderId={o.id} />
                    {o.status === "done" && !o.served && (
                      <button
                        onClick={() => serve(o.id)}
                        disabled={busy === o.id}
                        className="rounded-lg bg-mango px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Mark served
                      </button>
                    )}
                    {o.paymentStatus !== "paid" && (
                      <>
                        <button
                          onClick={() => setDiscountOrder(o)}
                          disabled={busy === o.id}
                          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          {o.discountAmount > 0 ? "Edit discount" : "Discount"}
                        </button>
                        <button
                          onClick={() => setLoyaltyOrderId(o.id)}
                          disabled={busy === o.id}
                          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          ⭐ Points
                        </button>
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
                        <button
                          onClick={() => setVoidOrderTarget({ id: o.id, label: t.label })}
                          disabled={busy === o.id}
                          className="rounded-lg border border-guava/40 px-3 py-1.5 text-xs font-semibold text-guava disabled:opacity-60"
                        >
                          Void
                        </button>
                      </>
                    )}
                    {/* Only paid orders can be closed/dismissed — an unpaid open
                        order stays on the board until the customer pays. */}
                    {o.paymentStatus === "paid" && (
                      <button
                        onClick={() => close(o.id)}
                        disabled={busy === o.id}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold btn-brand disabled:opacity-60"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        </div>
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
                    <span className="font-heading font-bold">{o.label}</span>
                    <span className="font-semibold">{formatPeso(o.total)}</span>
                  </div>
                  {o.channel !== "dine_in" && (
                    <p className="mt-0.5 text-xs text-plum-ink/55">
                      {o.channel === "delivery" ? "🛵 Delivery" : "🥡 Pickup"}
                      {o.customerPhone ? ` · ${o.customerPhone}` : ""}
                      {o.customerAddress ? ` · ${o.customerAddress}` : ""}
                      {o.mapUrl && (
                        <>
                          {" · "}
                          <a href={o.mapUrl} target="_blank" rel="noopener" className="font-semibold text-brand-primary underline">📍 Map</a>
                        </>
                      )}
                    </p>
                  )}
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

      {/* Food-ready / serve popup */}
      {showReady && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">
                🍽️ {readyOrders.length === 1 ? "Food ready" : `${readyOrders.length} orders ready`}
              </h2>
              <button
                onClick={() => setReadyDismissed(true)}
                className="text-sm font-semibold text-plum-ink/50"
              >
                View board
              </button>
            </div>
            <p className="mt-1 text-sm text-plum-ink/55">
              The kitchen finished these orders. Serve them, then confirm.
            </p>

            <ul className="mt-4 space-y-3">
              {readyOrders.map((o) => (
                <li key={o.id} className="rounded-lg border border-mango/40 bg-mango/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold">Table {o.tableNumber}</span>
                    <span className="text-sm text-plum-ink/60">
                      {o.itemCount} item{o.itemCount > 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => serve(o.id)}
                    disabled={busy === o.id}
                    className="mt-3 w-full rounded-full bg-mango py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Confirm served
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Waiter-call popup */}
      {waiterCalls.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">
                🔔 {waiterCalls.length === 1 ? "Waiter requested" : `${waiterCalls.length} waiter calls`}
              </h2>
              <button
                onClick={() => setWaiterCalls([])}
                className="text-sm font-semibold text-plum-ink/50"
              >
                Clear all
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {waiterCalls.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-mango/40 bg-mango/5 p-3"
                >
                  <span className="font-heading font-bold">Table {c.tableNumber}</span>
                  <button
                    onClick={() => setWaiterCalls((prev) => prev.filter((x) => x.id !== c.id))}
                    className="rounded-full bg-mango px-4 py-1.5 text-sm font-semibold text-white"
                  >
                    Got it
                  </button>
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

      {discountOrder && (
        <DiscountModal
          order={discountOrder}
          onClose={() => setDiscountOrder(null)}
          onApplied={(t) => setTables(t)}
        />
      )}

      {loyaltyOrderId && (
        <LoyaltyRedeemModal
          orderId={loyaltyOrderId}
          onClose={() => setLoyaltyOrderId(null)}
          onApplied={(t) => setTables(t)}
        />
      )}

      {addCustomerOpen && <AddCustomerModal onClose={() => setAddCustomerOpen(false)} />}

      {closedOpen && (
        <ClosedOrdersModal onClose={() => setClosedOpen(false)} onReopened={(t) => setTables(t)} />
      )}

      {shiftOpen && <ShiftSummaryModal onClose={() => setShiftOpen(false)} />}

      {cashOutOpen && <CashOutModal onClose={() => setCashOutOpen(false)} />}

      {voidOrderTarget && (
        <VoidPinModal
          orderId={voidOrderTarget.id}
          label={voidOrderTarget.label}
          onClose={() => setVoidOrderTarget(null)}
          onVoided={(t) => setTables(t)}
        />
      )}
    </div>
  );
}
