"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getKitchenOrders, advanceOrderStatus } from "@/server/orders/kitchen";
import type { KitchenOrder } from "@/lib/orders/types";
import { useOnline } from "@/lib/offline/useOnline";
import { kvGet, kvSet, outboxAdd, outboxAll, outboxRemove, type OutboxOp } from "@/lib/offline/idb";
import { ConnectivityPill } from "@/components/offline/ConnectivityPill";

function minutesAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  return `${mins}m ago`;
}

function OrderCard({
  order,
  onAdvance,
  busy,
}: {
  order: KitchenOrder;
  onAdvance: (id: string, to: "preparing" | "done") => void;
  busy: boolean;
}) {
  const next = order.status === "new" ? "preparing" : "done";
  const label = order.status === "new" ? "Start preparing" : "Mark ready 🔔";
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-heading text-lg font-extrabold">
          Table {order.tableNumber}
        </span>
        <span className="text-xs text-plum-ink/50">
          {minutesAgo(order.createdAt)}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {order.items.map((it) => (
          <li key={it.id} className="text-sm">
            <span className="font-semibold">{it.quantity}×</span> {it.name}
            {it.modifiers.length > 0 && (
              <span className="text-plum-ink/50"> · {it.modifiers.join(", ")}</span>
            )}
            {it.note && (
              <span className="block text-xs italic text-guava">“{it.note}”</span>
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={() => onAdvance(order.id, next)}
        disabled={busy}
        className="mt-3 w-full rounded-lg py-2 text-sm font-semibold btn-brand disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}

const CACHE_KEY = "kitchen:orders";

export function KitchenBoard({
  restaurantId,
  initialOrders,
  offlineEnabled = false,
}: {
  restaurantId: string;
  initialOrders: KitchenOrder[];
  offlineEnabled?: boolean;
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const online = useOnline();
  const syncing = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const fresh = await getKitchenOrders();
      setOrders(fresh);
      if (offlineEnabled) kvSet(CACHE_KEY, fresh); // keep the offline read-cache warm
    } catch {
      /* ignore transient errors; next tick retries */
    }
  }, [offlineEnabled]);

  // Replay any queued status changes once we're back online (idempotent server-side).
  const drainOutbox = useCallback(async () => {
    if (!offlineEnabled || syncing.current) return;
    syncing.current = true;
    try {
      const ops = await outboxAll();
      for (const op of ops) {
        try {
          await advanceOrderStatus(op.orderId, op.toStatus);
          await outboxRemove(op.opId);
        } catch {
          break; // still offline / transient — try again next tick
        }
      }
      setPending((await outboxAll()).length);
    } finally {
      syncing.current = false;
    }
    await refresh();
  }, [offlineEnabled, refresh]);

  // On mount: hydrate from the cache if we loaded offline, and show the queue size.
  useEffect(() => {
    if (!offlineEnabled) return;
    (async () => {
      setPending((await outboxAll()).length);
      if (!navigator.onLine) {
        const cached = await kvGet<KitchenOrder[]>(CACHE_KEY);
        if (cached) setOrders(cached);
      }
    })();
  }, [offlineEnabled]);

  // When connectivity returns, drain the queue.
  useEffect(() => {
    if (offlineEnabled && online) drainOutbox();
  }, [offlineEnabled, online, drainOutbox]);

  // Realtime ping + polling fallback.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    // Fallback so the board still updates if realtime isn't configured.
    const poll = setInterval(refresh, 15000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  // Optimistically move an order locally (and refresh the offline cache).
  function applyLocal(id: string, to: "preparing" | "done") {
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, status: to } : o));
      if (offlineEnabled) kvSet(CACHE_KEY, next);
      return next;
    });
  }

  async function queueOffline(id: string, to: "preparing" | "done") {
    const op: OutboxOp = {
      opId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${id}-${Date.now()}`,
      type: "advance",
      orderId: id,
      toStatus: to,
      createdAt: Date.now(),
    };
    await outboxAdd(op);
    applyLocal(id, to);
    setPending((await outboxAll()).length);
  }

  async function handleAdvance(id: string, to: "preparing" | "done") {
    // Offline: queue the change and update the board optimistically.
    if (offlineEnabled && !online) {
      await queueOffline(id, to);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await advanceOrderStatus(id, to);
      if (res.ok && res.orders) {
        setOrders(res.orders);
        if (offlineEnabled) kvSet(CACHE_KEY, res.orders);
      } else if (!res.ok) {
        setError(res.error ?? "Couldn't update the order.");
        refresh(); // resync in case another tablet already moved it
      }
    } catch {
      // Network died mid-request — fall back to the offline queue if enabled.
      if (offlineEnabled) {
        await queueOffline(id, to);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusyId(null); // never leave the button stuck
    }
  }

  const incoming = orders.filter((o) => o.status === "new");
  const preparing = orders.filter((o) => o.status === "preparing");

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 text-xs text-plum-ink/50">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
          {live ? "Live" : "Polling (realtime offline)"}
        </span>
        {offlineEnabled && <ConnectivityPill online={online} pending={pending} />}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-guava/40 bg-guava/10 px-4 py-2 text-sm text-guava">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-heading text-lg font-bold">
            New <span className="text-plum-ink/40">({incoming.length})</span>
          </h2>
          <div className="space-y-3">
            {incoming.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onAdvance={handleAdvance}
                busy={busyId === o.id}
              />
            ))}
            {incoming.length === 0 && (
              <p className="text-sm text-plum-ink/40">No new orders.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-heading text-lg font-bold">
            Preparing{" "}
            <span className="text-plum-ink/40">({preparing.length})</span>
          </h2>
          <div className="space-y-3">
            {preparing.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onAdvance={handleAdvance}
                busy={busyId === o.id}
              />
            ))}
            {preparing.length === 0 && (
              <p className="text-sm text-plum-ink/40">Nothing in progress.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
