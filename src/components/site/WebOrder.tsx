"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatPeso, formatDelta } from "@/lib/money";
import {
  unitPrice,
  validateSelection,
  selectionToLineModifiers,
  cartTotal,
  cartCount,
} from "@/lib/cart/pricing";
import type { CartLine, DinerCategory, DinerItem, Selection } from "@/lib/cart/types";
import { placeWebOrder } from "@/server/orders/web-order";

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Inline modifier/quantity picker (no i18n dependency). */
function ItemConfig({ item, onAdd, onCancel }: { item: DinerItem; onAdd: (l: CartLine) => void; onCancel: () => void }) {
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showError, setShowError] = useState(false);
  const price = useMemo(() => unitPrice(item, selection), [item, selection]);
  const error = useMemo(() => validateSelection(item, selection), [item, selection]);

  function toggle(g: string, m: string, single: boolean, max: number) {
    setSelection((prev) => {
      const cur = prev[g] ?? [];
      if (single) return { ...prev, [g]: [m] };
      if (cur.includes(m)) return { ...prev, [g]: cur.filter((x) => x !== m) };
      if (cur.length >= max) return prev;
      return { ...prev, [g]: [...cur, m] };
    });
  }
  function add() {
    if (error) return setShowError(true);
    onAdd({
      lineId: lineId(),
      itemId: item.id,
      name: item.name,
      basePrice: item.price,
      unitPrice: price,
      quantity,
      modifiers: selectionToLineModifiers(item, selection),
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 sm:rounded-tile" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-heading text-xl font-bold text-brand-ink">{item.name}</h2>
          <button onClick={onCancel} className="text-2xl leading-none text-plum-ink/40">×</button>
        </div>
        {item.description && <p className="mt-1 text-sm text-brand-ink/60">{item.description}</p>}
        {item.groups.map((group) => {
          const single = group.maxSelect === 1;
          const chosen = selection[group.id] ?? [];
          return (
            <fieldset key={group.id} className="mt-4">
              <legend className="font-semibold text-brand-ink">{group.name}{group.required && <span className="text-guava"> *</span>}</legend>
              <div className="mt-2 space-y-1">
                {group.modifiers.map((mod) => (
                  <label key={mod.id} className="flex items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input type={single ? "radio" : "checkbox"} name={group.id} checked={chosen.includes(mod.id)} onChange={() => toggle(group.id, mod.id, single, group.maxSelect)} />
                      {mod.name}
                    </span>
                    {mod.priceDelta !== 0 && <span className="text-brand-primary">{formatDelta(mod.priceDelta)}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special request (optional)" className="mt-4 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        {showError && error && <p className="mt-2 text-sm text-guava">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-plum-ink/15">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg">−</button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <button onClick={() => setQuantity((q) => q + 1)} className="px-3 py-2 text-lg">+</button>
          </div>
          <button onClick={add} disabled={!!error} className="flex-1 rounded-full py-3 font-semibold btn-brand disabled:opacity-50">
            Add · {formatPeso(price * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WebOrder({ slug, restaurantName, categories, homeHref }: { slug: string; restaurantName: string; categories: DinerCategory[]; homeHref?: string }) {
  const home = homeHref ?? `/r/${slug}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [configItem, setConfigItem] = useState<DinerItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderType, setOrderType] = useState<"takeout" | "delivery">("takeout");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);

  const count = cartCount(lines);
  const total = cartTotal(lines);
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  function pick(item: DinerItem) {
    if (!item.isAvailable) return;
    if (item.groups.length === 0) {
      setLines((p) => [...p, { lineId: lineId(), itemId: item.id, name: item.name, basePrice: item.price, unitPrice: item.price, quantity: 1, modifiers: [] }]);
    } else setConfigItem(item);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await placeWebOrder({
      slug,
      orderType,
      customerName: name,
      customerPhone: phone,
      customerAddress: orderType === "delivery" ? address : undefined,
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, modifierIds: l.modifiers.map((m) => m.modifierId) })),
    });
    setBusy(false);
    if (res.ok) setPlacedId(res.orderId);
    else setError(res.error);
  }

  if (placedId) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-3xl text-white">✓</div>
        <h1 className="mt-4 font-heading text-2xl font-bold text-brand-ink">Order placed!</h1>
        <p className="mt-2 text-sm text-brand-ink/60">
          {restaurantName} received your {orderType === "delivery" ? "delivery" : "pickup"} order. Reference{" "}
          <span className="font-semibold">#{placedId.slice(0, 8).toUpperCase()}</span>. They&apos;ll call {phone} to confirm.
        </p>
        <Link href={home} className="mt-6 inline-block rounded-full px-6 py-3 font-semibold btn-brand">Back to {restaurantName}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pb-28 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={home} className="text-sm text-brand-ink/50">← {restaurantName}</Link>
          <h1 className="font-heading text-2xl font-bold text-brand-ink">Order online</h1>
        </div>
      </div>

      {nonEmpty.length === 0 && <p className="mt-8 text-sm text-brand-ink/50">No items available right now.</p>}
      {nonEmpty.map((cat) => (
        <section key={cat.id} className="mt-6">
          <h2 className="font-heading text-lg font-bold text-brand-ink">{cat.name}</h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cat.items.map((item) => (
              <button key={item.id} disabled={!item.isAvailable} onClick={() => pick(item)} className="group relative flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-brand-ink/5 active:scale-[0.98] disabled:opacity-50">
                <div className="relative aspect-square bg-cream">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-brand-gradient text-2xl font-bold text-white">{item.name.charAt(0)}</div>
                  )}
                  {item.isAvailable && <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-xl font-bold text-white shadow">+</span>}
                  <span className="absolute bottom-2 right-2 rounded-full bg-brand-primary px-2.5 py-1 text-xs font-extrabold text-white">{formatPeso(item.price)}</span>
                  {!item.isAvailable && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-brand-ink">Sold out</span>}
                </div>
                <p className="p-2.5 text-sm font-semibold text-brand-ink">{item.name}</p>
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Sticky cart bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl p-4">
          <button onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between rounded-full px-5 py-3.5 font-semibold text-white shadow-lg btn-brand">
            <span>{count} item{count > 1 ? "s" : ""}</span>
            <span>Checkout · {formatPeso(total)}</span>
          </button>
        </div>
      )}

      {configItem && <ItemConfig item={configItem} onAdd={(l) => { setLines((p) => [...p, l]); setConfigItem(null); }} onCancel={() => setConfigItem(null)} />}

      {/* Cart + checkout sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setCartOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 sm:rounded-tile" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-brand-ink">Your order</h2>
              <button onClick={() => setCartOpen(false)} className="text-2xl leading-none text-plum-ink/40">×</button>
            </div>

            <ul className="mt-3 divide-y divide-plum-ink/5">
              {lines.map((l) => (
                <li key={l.lineId} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{l.quantity}× {l.name}</span>
                    {l.modifiers.length > 0 && <p className="text-xs text-plum-ink/50">{l.modifiers.map((m) => m.name).join(", ")}</p>}
                    {l.note && <p className="text-xs italic text-plum-ink/50">“{l.note}”</p>}
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-semibold">{formatPeso(l.unitPrice * l.quantity)}</span>
                    <button onClick={() => setLines((p) => p.filter((x) => x.lineId !== l.lineId))} className="text-xs text-muted hover:text-guava">remove</button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Fulfillment */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-cream/60 p-1">
              {([["takeout", "🥡 Pickup"], ["delivery", "🛵 Delivery"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setOrderType(k)} className={`rounded-md py-2 text-sm font-semibold ${orderType === k ? "bg-white text-brand-primary shadow-sm" : "text-brand-ink/60"}`}>{label}</button>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone number" className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm" />
              {orderType === "delivery" && <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Delivery address" className="w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm" />}
            </div>

            {error && <p className="mt-3 text-sm text-guava">{error}</p>}

            <div className="mt-4 flex justify-between font-heading text-lg font-bold text-brand-ink">
              <span>Total</span><span>{formatPeso(total)}</span>
            </div>
            <button
              onClick={submit}
              disabled={busy || lines.length === 0 || !name.trim() || !phone.trim() || (orderType === "delivery" && !address.trim())}
              className="mt-3 w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-50"
            >
              {busy ? "Placing order…" : "Place order"}
            </button>
            <p className="mt-2 text-center text-xs text-brand-ink/40">Pay on {orderType === "delivery" ? "delivery" : "pickup"}. The restaurant will confirm by phone.</p>
          </div>
        </div>
      )}
    </div>
  );
}
