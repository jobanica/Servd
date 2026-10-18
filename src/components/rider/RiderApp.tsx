"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPeso } from "@/lib/money";
import { prepareReceipt } from "@/lib/images/receipt";
import { useOrdersRefresh } from "@/lib/realtime/useOrdersRefresh";
import { changeFor, directionsUrl } from "@/lib/rider/rider";
import {
  markRiderDelivered,
  pickUpOrder,
  refreshRiderBoard,
  releaseOrder,
  type RiderBoard,
  type RiderOrder,
} from "@/server/rider/actions";
import { MiniMap } from "@/components/cashier/MiniMap";
import { SignOutButton } from "@/components/merchant/SignOutButton";
import { InstallButton } from "@/components/merchant/InstallButton";

/**
 * The Rider app: a phone screen inside Servd. Today's delivery orders, a map
 * for each, "Pick up" to take one and "Delivered" to hand it over and say how
 * the customer paid. The Today tab is the rider's count and cash for the day.
 */
export function RiderApp({
  restaurantId,
  restaurantName,
  riderName,
  initial,
}: {
  restaurantId: string;
  restaurantName: string;
  riderName: string;
  initial: RiderBoard;
}) {
  const [board, setBoard] = useState<RiderBoard>(initial);
  const [tab, setTab] = useState<"orders" | "today">("orders");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<RiderOrder | null>(null);

  const reload = useCallback(async () => {
    const r = await refreshRiderBoard();
    if (r.ok) setBoard(r.board);
  }, []);
  useOrdersRefresh(restaurantId, reload, 15_000);

  // The service worker makes it installable (Chrome won't offer "Install app"
  // without one) and keeps a page to show when the signal drops mid-run.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  async function run(id: string, fn: () => ReturnType<typeof refreshRiderBoard>) {
    setBusy(id);
    setError(null);
    const r = await fn();
    if (r.ok) setBoard(r.board);
    else setError(r.error);
    setBusy(null);
  }

  const mine = board.orders.filter((o) => o.mine && o.stage === "on_the_way");
  const waiting = board.orders.filter((o) => o.stage !== "on_the_way");
  const others = board.orders.filter((o) => !o.mine && o.stage === "on_the_way");

  return (
    <div className="min-h-screen bg-cream pb-24">
      <header className="sticky top-0 z-20 bg-red-600 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] text-white shadow">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-extrabold">🛵 Riders</p>
            <p className="truncate text-xs text-white/80">
              {riderName} · {restaurantName}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <InstallButton subtle />
            <SignOutButton dark />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-white/15 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setTab("orders")}
            className={`rounded-full py-1.5 ${tab === "orders" ? "bg-white text-red-700" : "text-white"}`}
          >
            Deliveries{mine.length + waiting.length > 0 ? ` (${mine.length + waiting.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("today")}
            className={`rounded-full py-1.5 ${tab === "today" ? "bg-white text-red-700" : "text-white"}`}
          >
            Today ({board.today.delivered})
          </button>
        </div>
      </header>

      {error && (
        <p className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>
      )}

      {tab === "orders" ? (
        <main className="space-y-6 px-4 pt-4">
          <Section title="🛵 On the way — mine" empty="Nothing on the way. Pick up an order below." count={mine.length}>
            {mine.map((o) => (
              <OrderCard key={o.id} o={o} expanded>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaying(o)}
                    className="col-span-2 rounded-xl bg-green-600 py-3 text-base font-bold text-white"
                  >
                    ✓ Delivered
                  </button>
                  <button
                    type="button"
                    disabled={busy === o.id}
                    onClick={() => run(o.id, () => releaseOrder(o.id))}
                    className="col-span-2 py-1 text-xs font-semibold text-plum-ink/50"
                  >
                    Taken by mistake? Put it back
                  </button>
                </div>
              </OrderCard>
            ))}
          </Section>

          <Section title="📦 To deliver" empty="No delivery orders waiting." count={waiting.length}>
            {waiting.map((o) => (
              <OrderCard key={o.id} o={o}>
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => run(o.id, () => pickUpOrder(o.id))}
                  className={`w-full rounded-xl py-3 text-base font-bold text-white disabled:opacity-50 ${
                    o.stage === "ready" ? "bg-red-600" : "bg-plum-ink/70"
                  }`}
                >
                  {busy === o.id ? "…" : o.stage === "ready" ? "Pick up & go" : "Pick up (still preparing)"}
                </button>
              </OrderCard>
            ))}
          </Section>

          {others.length > 0 && (
            <Section title="With other riders" count={others.length}>
              {others.map((o) => (
                <div key={o.id} className="rounded-xl border border-plum-ink/10 bg-white px-3 py-2 text-sm">
                  <span className="font-semibold">{o.ref}</span> · {o.customerName ?? "Customer"} ·{" "}
                  <span className="text-plum-ink/60">🛵 {o.riderName}</span>
                </div>
              ))}
            </Section>
          )}
        </main>
      ) : (
        <TodayTab board={board} />
      )}

      {paying && (
        <PaySheet
          o={paying}
          onClose={() => setPaying(null)}
          onDone={(b) => {
            setBoard(b);
            setPaying(null);
            setTab("today");
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  count,
  children,
}: {
  title: string;
  empty?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 font-heading text-base font-extrabold text-plum-ink">{title}</h2>
      {count === 0 && empty ? (
        <p className="rounded-xl bg-white/70 px-3 py-4 text-center text-sm text-plum-ink/50">{empty}</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

function OrderCard({ o, expanded = false, children }: { o: RiderOrder; expanded?: boolean; children: React.ReactNode }) {
  const [showMap, setShowMap] = useState(expanded);
  const nav = directionsUrl(o.lat, o.lng, o.address);
  const change = o.paid ? null : changeFor(o.due, o.cashTendered);
  return (
    <div className="overflow-hidden rounded-2xl border border-plum-ink/10 bg-white shadow-sm">
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-heading text-base font-bold text-plum-ink">
              {o.customerName ?? "Customer"} <span className="text-xs font-semibold text-plum-ink/40">{o.ref}</span>
            </p>
            {o.when && <p className="text-xs font-bold text-red-600">{o.when}</p>}
          </div>
          <div className="shrink-0 text-right">
            {o.paid ? (
              <p className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">PAID ✓</p>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase text-plum-ink/50">Collect</p>
                <p className="font-heading text-lg font-extrabold text-plum-ink">{formatPeso(o.due)}</p>
              </>
            )}
          </div>
        </div>

        {o.address && <p className="text-sm text-plum-ink/80">📍 {o.address}</p>}
        {o.note && <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">📝 {o.note}</p>}
        {!o.paid && o.paymentChoice === "gcash" && (
          <p className="text-xs font-semibold text-blue-700">Customer chose GCash — get the receipt photo.</p>
        )}
        {change != null && (
          <p className="text-xs font-semibold text-plum-ink/70">
            💵 Pays with {formatPeso(o.cashTendered!)} — bring {formatPeso(change)} change
          </p>
        )}
        <p className="text-xs text-plum-ink/60">
          {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
        </p>

        <div className="flex flex-wrap gap-2">
          {nav && (
            <a href={nav} target="_blank" rel="noreferrer" className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">
              🧭 Navigate
            </a>
          )}
          {o.customerPhone && (
            <a href={`tel:${o.customerPhone}`} className="rounded-full bg-plum-ink/5 px-3 py-1.5 text-xs font-bold text-plum-ink">
              📞 Call
            </a>
          )}
          {o.lat != null && o.lng != null && (
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              className="rounded-full bg-plum-ink/5 px-3 py-1.5 text-xs font-bold text-plum-ink"
            >
              🗺 {showMap ? "Hide map" : "Map"}
            </button>
          )}
        </div>
        {showMap && o.lat != null && o.lng != null && <MiniMap lat={o.lat} lng={o.lng} />}
        {children}
      </div>
    </div>
  );
}

/** "Delivered": how did the customer pay? GCash needs a photo of the receipt. */
function PaySheet({ o, onClose, onDone }: { o: RiderOrder; onClose: () => void; onDone: (b: RiderBoard) => void }) {
  const [method, setMethod] = useState<"cash" | "gcash" | "prepaid" | null>(o.paid ? "prepaid" : null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    const r = await prepareReceipt(file);
    if (r.dataUrl) setPhoto(r.dataUrl);
    else setError(r.error ?? "Couldn't read that photo.");
  }

  async function confirm() {
    if (!method) return;
    setBusy(true);
    setError(null);
    const r = await markRiderDelivered({ orderId: o.id, method, receipt: method === "gcash" ? photo : null });
    setBusy(false);
    if (r.ok) onDone(r.board);
    else setError(r.error);
  }

  const ready = method === "cash" || method === "prepaid" || (method === "gcash" && !!photo);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={busy ? undefined : onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(env(safe-area-inset-bottom),20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-plum-ink/15" />
        <h2 className="font-heading text-xl font-extrabold text-plum-ink">Delivered {o.ref}</h2>
        <p className="text-sm text-plum-ink/60">{o.customerName ?? "Customer"}</p>

        {o.paid ? (
          <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            Paid online already — nothing to collect.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm font-semibold text-plum-ink/70">
              How did they pay <span className="text-plum-ink">{formatPeso(o.due)}</span>?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod("cash")}
                className={`rounded-xl border-2 py-4 text-base font-bold ${
                  method === "cash" ? "border-green-600 bg-green-50 text-green-700" : "border-plum-ink/15 text-plum-ink"
                }`}
              >
                💵 Cash
              </button>
              <button
                type="button"
                onClick={() => setMethod("gcash")}
                className={`rounded-xl border-2 py-4 text-base font-bold ${
                  method === "gcash" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-plum-ink/15 text-plum-ink"
                }`}
              >
                📱 GCash
              </button>
            </div>
            {method === "gcash" && (
              <div className="mt-3">
                {photo ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo} alt="GCash receipt" className="h-24 w-24 rounded-lg border object-cover" />
                    <label className="cursor-pointer text-sm font-semibold text-blue-700">
                      Retake
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                    </label>
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 py-5 text-sm font-bold text-blue-700">
                    📷 Take a photo of the GCash receipt
                    <span className="text-xs font-normal text-blue-700/70">Required for GCash</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                  </label>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}

        <button
          type="button"
          disabled={!ready || busy}
          onClick={confirm}
          className="mt-5 w-full rounded-xl bg-green-600 py-3.5 text-base font-bold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Confirm delivered"}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className="mt-2 w-full py-2 text-sm font-semibold text-plum-ink/50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function TodayTab({ board }: { board: RiderBoard }) {
  const t = board.today;
  return (
    <main className="space-y-4 px-4 pt-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Delivered" value={String(t.delivered)} />
        <Stat label="Total collected" value={formatPeso(t.collected)} />
        <Stat label="💵 Cash" value={formatPeso(t.cash)} tone="green" />
        <Stat label="📱 GCash" value={formatPeso(t.gcash)} tone="blue" />
      </div>
      {t.prepaid > 0 && (
        <p className="text-center text-xs text-plum-ink/50">
          {t.prepaid} paid online already — nothing collected.
        </p>
      )}
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-800">
        Hand over {formatPeso(t.cash)} cash at the end of your shift.
      </p>

      <section>
        <h2 className="mb-2 font-heading text-base font-extrabold text-plum-ink">Delivered today</h2>
        {board.deliveries.length === 0 ? (
          <p className="rounded-xl bg-white/70 px-3 py-4 text-center text-sm text-plum-ink/50">No deliveries yet today.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5 overflow-hidden rounded-2xl border border-plum-ink/10 bg-white">
            {board.deliveries.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                {d.receiptUrl ? (
                  <a href={d.receiptUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.receiptUrl} alt="GCash receipt" className="h-10 w-10 rounded-md border object-cover" />
                  </a>
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-plum-ink/5 text-lg">
                    {d.method === "cash" ? "💵" : d.method === "gcash" ? "📱" : "✅"}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-plum-ink">
                    {d.customerName ?? "Customer"} <span className="text-xs text-plum-ink/40">{d.ref}</span>
                  </p>
                  <p className="text-xs text-plum-ink/50">
                    {new Date(d.deliveredAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}
                    {" · "}
                    {d.method === "cash" ? "Cash" : d.method === "gcash" ? "GCash" : "Paid online"}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-plum-ink">{d.collected > 0 ? formatPeso(d.collected) : "—"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "green" | "blue" }) {
  const color = tone === "green" ? "text-green-700" : tone === "blue" ? "text-blue-700" : "text-plum-ink";
  return (
    <div className="rounded-2xl border border-plum-ink/10 bg-white p-3">
      <p className="text-xs font-semibold text-plum-ink/50">{label}</p>
      <p className={`font-heading text-2xl font-extrabold ${color}`}>{value}</p>
    </div>
  );
}
