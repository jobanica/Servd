"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getKitchenOrders, advanceOrderStatus } from "@/server/orders/kitchen";
import type { KitchenOrder } from "@/lib/orders/types";

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

export function KitchenBoard({
  restaurantId,
  initialOrders,
}: {
  restaurantId: string;
  initialOrders: KitchenOrder[];
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOrders(await getKitchenOrders());
    } catch {
      /* ignore transient errors; next tick retries */
    }
  }, []);

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

  async function handleAdvance(id: string, to: "preparing" | "done") {
    setBusyId(id);
    setError(null);
    try {
      const res = await advanceOrderStatus(id, to);
      if (res.ok && res.orders) {
        setOrders(res.orders);
      } else if (!res.ok) {
        setError(res.error ?? "Couldn't update the order.");
        refresh(); // resync in case another tablet already moved it
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusyId(null); // never leave the button stuck
    }
  }

  const incoming = orders.filter((o) => o.status === "new");
  const preparing = orders.filter((o) => o.status === "preparing");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-xs text-plum-ink/50">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            live ? "bg-mango" : "bg-muted"
          }`}
        />
        {live ? "Live" : "Polling (realtime offline)"}
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
