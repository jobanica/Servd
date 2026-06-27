"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatPeso } from "@/lib/money";
import { printKitchenTicket } from "@/server/printing/print";
import { runPrintDispatch } from "@/lib/print/run-dispatch";
import {
  getMerchantOrders,
  acceptMerchantOrder,
  rejectMerchantOrder,
  advanceMerchantOrder,
  createTestOrder,
  type MerchantData,
  type MerchantOrder,
  type MerchantAdvance,
  type RejectReason,
} from "@/server/orders/merchant";
import { useOrderAlarm } from "./useOrderAlarm";
import { useWakeLock } from "./useWakeLock";

const PREP_CHOICES = [10, 15, 20, 30, 45];
const REJECT_LABELS: { key: RejectReason; label: string }[] = [
  { key: "out_of_stock", label: "Out of stock" },
  { key: "too_busy", label: "Too busy" },
  { key: "closed", label: "We're closed" },
];

function typeBadge(o: MerchantOrder): string {
  if (o.orderType === "delivery") return "🛵 Delivery";
  if (o.orderType === "takeout") return "🥡 Pickup";
  return "🍽️ Dine-in";
}

function minsAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m} min ago`;
}

/** The next step a merchant can take on an accepted order, by its current state. */
function nextAction(o: MerchantOrder): { to: MerchantAdvance; label: string } | null {
  if (o.status === "new") return { to: "preparing", label: "Start preparing" };
  if (o.status === "preparing") return { to: "ready", label: "Mark ready" };
  if (o.status === "done") {
    if (o.orderType === "delivery") {
      if (o.deliveryStatus === "out_for_delivery") return { to: "delivered", label: "Mark delivered" };
      return { to: "out_for_delivery", label: "Out for delivery" };
    }
    return { to: "completed", label: "Handed off / completed" };
  }
  return null;
}

function OrderLines({ o }: { o: MerchantOrder }) {
  return (
    <ul className="space-y-1.5">
      {o.items.map((it, i) => (
        <li key={i} className="text-lg">
          <span className="font-bold">{it.quantity}×</span> {it.name}
          {it.modifiers.length > 0 && (
            <span className="block pl-7 text-base text-plum-ink/60">+ {it.modifiers.join(", ")}</span>
          )}
          {it.note && <span className="block pl-7 text-base font-medium text-guava">“{it.note}”</span>}
        </li>
      ))}
    </ul>
  );
}

export function MerchantBoard({
  restaurantId,
  restaurantName,
  initial,
}: {
  restaurantId: string;
  restaurantName: string;
  initial: MerchantData;
}) {
  const [data, setData] = useState<MerchantData>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [live, setLive] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const alarm = useOrderAlarm();
  useWakeLock(true);

  const refresh = useCallback(async () => {
    try {
      setData(await getMerchantOrders());
    } catch {
      /* transient — the poll will retry */
    }
  }, []);

  // Realtime + polling fallback (same channel the cashier/kitchen use).
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const poll = setInterval(refresh, 10000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  // Register the service worker so the screen is installable as a PWA.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Ring while any order is waiting to be accepted; stop once the queue clears.
  const waiting = data.incoming.length;
  useEffect(() => {
    if (alarm.unlocked && waiting > 0) alarm.start();
    else alarm.stop();
  }, [alarm, waiting]);

  async function accept(orderId: string, prepMinutes: number | null) {
    setBusy(orderId);
    const res = await acceptMerchantOrder(orderId, prepMinutes);
    if (res.data) setData(res.data);
    // Optional auto-print: covers every transport via runPrintDispatch.
    if (autoPrint && res.ok) {
      try {
        const p = await printKitchenTicket(orderId);
        await runPrintDispatch(p, orderId, "kitchen");
      } catch {
        /* printing must never block service */
      }
    }
    setBusy(null);
  }

  async function reject(orderId: string, reason: RejectReason) {
    setBusy(orderId);
    const res = await rejectMerchantOrder(orderId, reason);
    if (res.data) setData(res.data);
    setRejecting(null);
    setBusy(null);
  }

  async function advance(orderId: string, to: MerchantAdvance) {
    setBusy(orderId);
    const res = await advanceMerchantOrder(orderId, to);
    if (res.data) setData(res.data);
    setBusy(null);
  }

  async function sendTest() {
    setTestMsg(null);
    const res = await createTestOrder();
    if (res.data) setData(res.data);
    if (!res.ok) setTestMsg(res.error ?? "Couldn't send a test order.");
  }

  // ---- Audio-unlock gate (browsers block sound until a user gesture) --------
  if (!alarm.unlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plum-ink px-6 text-center text-white">
        <h1 className="font-heading text-3xl font-extrabold">{restaurantName} — Incoming Orders</h1>
        <p className="max-w-md text-white/70">
          Tap below to enable the new-order alarm. Keep this screen open and the tablet plugged in —
          the alarm only rings while this page is open and awake.
        </p>
        <button
          onClick={() => alarm.unlock()}
          className="rounded-2xl bg-brand-gradient px-10 py-6 text-2xl font-extrabold shadow-lg"
        >
          🔔 Tap to start
        </button>
      </div>
    );
  }

  const topIncoming = data.incoming[0] ?? null;

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-plum-ink/10 bg-white px-4 py-3">
        <div>
          <h1 className="font-heading text-lg font-extrabold leading-none">{restaurantName}</h1>
          <p className="text-xs text-plum-ink/50">Incoming online orders</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 font-semibold text-plum-ink/70">
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
            Auto-print
          </label>
          <span className={`flex items-center gap-1.5 ${live ? "text-green-600" : "text-plum-ink/40"}`}>
            <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-plum-ink/30"}`} />
            {live ? "Live" : "Reconnecting"}
          </span>
        </div>
      </header>

      {/* FULL-SCREEN incoming-order alert (the loud one) */}
      {topIncoming && (
        <div className="fixed inset-0 z-40 flex flex-col bg-brand-primary/95 p-5 text-white backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
            <div className="flex items-center justify-between">
              <p className="animate-pulse font-heading text-2xl font-extrabold">🔔 NEW ORDER</p>
              <p className="text-sm text-white/80">
                {data.incoming.length > 1 ? `${data.incoming.length} waiting · ` : ""}
                {minsAgo(topIncoming.createdAt)}
              </p>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto rounded-2xl bg-white p-5 text-plum-ink">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-heading text-xl font-extrabold">{typeBadge(topIncoming)}</p>
                  <p className="text-sm text-plum-ink/60">
                    {topIncoming.customerName ?? "Customer"}
                    {topIncoming.customerPhone ? ` · ${topIncoming.customerPhone}` : ""}
                  </p>
                  {topIncoming.orderType === "delivery" && topIncoming.customerAddress && (
                    <p className="mt-0.5 text-sm text-plum-ink/60">📍 {topIncoming.customerAddress}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-heading text-2xl font-extrabold">{formatPeso(topIncoming.total)}</p>
                  <p className="text-xs text-plum-ink/40">{topIncoming.ref}</p>
                </div>
              </div>

              <div className="mt-4 border-t border-plum-ink/10 pt-4">
                <OrderLines o={topIncoming} />
              </div>
            </div>

            {/* Accept (with prep-time) / Reject (with reason) */}
            {rejecting === topIncoming.id ? (
              <div className="mt-4">
                <p className="mb-2 text-center font-semibold">Why are you rejecting this order?</p>
                <div className="grid grid-cols-3 gap-2">
                  {REJECT_LABELS.map((r) => (
                    <button
                      key={r.key}
                      disabled={busy === topIncoming.id}
                      onClick={() => reject(topIncoming.id, r.key)}
                      className="rounded-2xl bg-white/15 py-5 text-lg font-bold ring-1 ring-white/30 disabled:opacity-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setRejecting(null)} className="mt-3 w-full py-2 text-sm font-semibold text-white/70">
                  ← Back
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <p className="mb-2 text-center text-sm font-semibold text-white/85">
                  Accept &amp; set how long it&apos;ll take:
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {PREP_CHOICES.map((m) => (
                    <button
                      key={m}
                      disabled={busy === topIncoming.id}
                      onClick={() => accept(topIncoming.id, m)}
                      className="rounded-2xl bg-white py-5 text-xl font-extrabold text-brand-primary shadow disabled:opacity-50"
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    disabled={busy === topIncoming.id}
                    onClick={() => accept(topIncoming.id, null)}
                    className="rounded-2xl bg-white/15 py-5 text-lg font-bold ring-1 ring-white/40 disabled:opacity-50"
                  >
                    ✓ Accept (no ETA)
                  </button>
                  <button
                    disabled={busy === topIncoming.id}
                    onClick={() => setRejecting(topIncoming.id)}
                    className="rounded-2xl bg-guava py-5 text-lg font-bold disabled:opacity-50"
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active orders */}
      <section className="mx-auto max-w-2xl px-4 py-4">
        <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/50">
          In progress ({data.active.length})
        </h2>
        {data.active.length === 0 ? (
          <p className="rounded-tile border border-dashed border-plum-ink/15 bg-white px-4 py-8 text-center text-sm text-plum-ink/40">
            No active orders. New orders will alarm here.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.active.map((o) => {
              const action = nextAction(o);
              return (
                <li key={o.id} className="rounded-tile border border-plum-ink/10 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-heading font-bold">
                        {typeBadge(o)}
                        {o.orderNumber ? ` · ${o.orderNumber}` : ""}
                      </p>
                      <p className="text-sm text-plum-ink/55">
                        {o.customerName ?? "Customer"}
                        {o.customerPhone ? ` · ${o.customerPhone}` : ""} · {o.ref}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatPeso(o.total)}</p>
                      <p className="text-xs text-plum-ink/40">
                        {o.status === "done" && o.deliveryStatus === "out_for_delivery"
                          ? "Out for delivery"
                          : o.status === "done"
                            ? "Ready"
                            : o.status === "preparing"
                              ? "Preparing"
                              : "Accepted"}
                        {o.prepMinutes != null ? ` · ~${o.prepMinutes}m` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-plum-ink/5 pt-3">
                    <OrderLines o={o} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {action && (
                      <button
                        disabled={busy === o.id}
                        onClick={() => advance(o.id, action.to)}
                        className="flex-1 rounded-xl bg-brand-gradient py-4 text-lg font-bold text-white disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    )}
                    <button
                      disabled={busy === o.id}
                      onClick={() => {
                        printKitchenTicket(o.id).then((p) => runPrintDispatch(p, o.id, "kitchen")).catch(() => {});
                      }}
                      className="rounded-xl border border-plum-ink/15 px-4 py-4 text-lg font-bold"
                      title="Print kitchen ticket"
                    >
                      🖨️
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Test order — verify the alarm + customer tracker end-to-end */}
        <div className="mt-6 rounded-tile border border-dashed border-plum-ink/15 bg-white p-3 text-center">
          <button
            onClick={sendTest}
            className="rounded-full border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary"
          >
            🧪 Send test order
          </button>
          <p className="mt-1.5 text-xs text-plum-ink/45">
            Rings the alarm with a sample order. Reject it after to clear it.
          </p>
          {testMsg && <p className="mt-1 text-xs font-semibold text-guava">{testMsg}</p>}
        </div>

        {/* History */}
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="mt-6 text-sm font-semibold text-plum-ink/50"
        >
          {showHistory ? "▾" : "▸"} Recent ({data.history.length})
        </button>
        {showHistory && (
          <ul className="mt-2 space-y-1.5">
            {data.history.map((o) => (
              <li key={o.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-plum-ink/70">
                  {typeBadge(o)} · {o.ref}
                  {o.status === "cancelled" && (
                    <span className="ml-1 text-guava">
                      rejected{o.cancelReason ? ` (${o.cancelReason.replace(/_/g, " ")})` : ""}
                    </span>
                  )}
                </span>
                <span className="text-plum-ink/50">{formatPeso(o.total)}</span>
              </li>
            ))}
            {data.history.length === 0 && <li className="text-sm text-plum-ink/40">Nothing yet.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
