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
import { LocationPicker } from "./LocationPicker";

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VAT_RATE = 0.12;

interface LoyaltyInfo {
  enabled: boolean;
  pesosPerPoint: number;
  pointValue: number;
}

interface DayHours { open: string; close: string; closed: boolean }
interface DeliveryZone { name: string; fee: number }

export interface WebOrderProps {
  slug: string;
  restaurantName: string;
  logoUrl?: string | null;
  categories: DinerCategory[];
  contact?: { address: string | null; phone: string | null };
  payOnline?: boolean;
  loyalty?: LoyaltyInfo | null;
  hours?: DayHours[];
  zones?: DeliveryZone[];
  openNow?: boolean;
  pauseWhenClosed?: boolean;
  homeHref?: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-heading text-xl font-bold text-plum-ink">{item.name}</h2>
          <button onClick={onCancel} className="text-2xl leading-none text-plum-ink/40">×</button>
        </div>
        {item.description && <p className="mt-1 text-sm text-plum-ink/60">{item.description}</p>}
        {item.groups.map((group) => {
          const single = group.maxSelect === 1;
          const chosen = selection[group.id] ?? [];
          return (
            <fieldset key={group.id} className="mt-4">
              <legend className="font-semibold text-plum-ink">{group.name}{group.required && <span className="text-guava"> *</span>}</legend>
              <div className="mt-2 space-y-1">
                {group.modifiers.map((mod) => (
                  <label key={mod.id} className="flex items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input type={single ? "radio" : "checkbox"} name={group.id} checked={chosen.includes(mod.id)} onChange={() => toggle(group.id, mod.id, single, group.maxSelect)} />
                      {mod.name}
                    </span>
                    {mod.priceDelta !== 0 && <span className="text-red-600">{formatDelta(mod.priceDelta)}</span>}
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
          <button onClick={add} disabled={!!error} className="flex-1 rounded-full bg-red-600 py-3 font-semibold text-white disabled:opacity-50">
            Add · {formatPeso(price * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Product card. */
function ProductCard({ item, onPick }: { item: DinerItem; onPick: (i: DinerItem) => void }) {
  return (
    <div className="flex flex-col rounded-xl border border-black/5 bg-white p-3 shadow-sm">
      <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-200 text-3xl font-bold text-gray-400">{item.name.charAt(0)}</div>
        )}
        {!item.isAvailable && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-plum-ink">Sold out</span>}
      </div>
      <p className="font-semibold text-plum-ink">{item.name}</p>
      {item.description && <p className="mt-0.5 line-clamp-2 text-xs text-plum-ink/50">{item.description}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-bold text-plum-ink">{formatPeso(item.price)}</span>
        <button
          onClick={() => onPick(item)}
          disabled={!item.isAvailable}
          aria-label={`Add ${item.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-xl font-bold text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function WebOrder(props: WebOrderProps) {
  const { slug, restaurantName, logoUrl, categories, contact, payOnline, loyalty, hours, zones = [], openNow, pauseWhenClosed } = props;
  const home = props.homeHref ?? `/r/${slug}`;
  const paused = !!pauseWhenClosed && openNow === false;

  const [lines, setLines] = useState<CartLine[]>([]);
  const [configItem, setConfigItem] = useState<DinerItem | null>(null);
  const [orderType, setOrderType] = useState<"takeout" | "delivery">("takeout");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false); // mobile cart sheet
  const [checkout, setCheckout] = useState(false);

  const count = cartCount(lines);
  const subtotal = cartTotal(lines);
  const deliveryFee = orderType === "delivery" ? zones.find((z) => z.name === zone)?.fee ?? 0 : 0;
  const total = subtotal + deliveryFee;
  const vat = Math.round(total - total / (1 + VAT_RATE));
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const q = search.trim().toLowerCase();
  const shownCats = q
    ? nonEmpty
        .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
        .filter((c) => c.items.length > 0)
    : nonEmpty;

  function pick(item: DinerItem) {
    if (!item.isAvailable) return;
    if (item.groups.length === 0) {
      setLines((p) => [...p, { lineId: lineId(), itemId: item.id, name: item.name, basePrice: item.price, unitPrice: item.price, quantity: 1, modifiers: [] }]);
    } else setConfigItem(item);
  }
  function setQty(id: string, delta: number) {
    setLines((p) =>
      p.flatMap((l) => (l.lineId === id ? (l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]) : [l])),
    );
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
      deliveryZone: orderType === "delivery" ? zone || undefined : undefined,
      lat: orderType === "delivery" ? geo?.lat : undefined,
      lng: orderType === "delivery" ? geo?.lng : undefined,
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, modifierIds: l.modifiers.map((m) => m.modifierId) })),
    });
    setBusy(false);
    if (res.ok) setPlacedId(res.orderId);
    else setError(res.error);
  }

  if (placedId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-5 py-16">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-3xl text-white">✓</div>
          <h1 className="mt-4 font-heading text-2xl font-bold text-plum-ink">Order placed!</h1>
          <p className="mt-2 text-sm text-plum-ink/60">
            {restaurantName} received your {orderType === "delivery" ? "delivery" : "pickup"} order. Reference{" "}
            <span className="font-semibold">#{placedId.slice(0, 8).toUpperCase()}</span>. They&apos;ll call {phone} to confirm.
          </p>
          <Link href={home} className="mt-6 inline-block rounded-full bg-red-600 px-6 py-3 font-semibold text-white">Back to menu</Link>
        </div>
      </div>
    );
  }

  // Reusable order/cart panel (right column on desktop, sheet on mobile).
  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-black/5 px-4 py-3">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/70">My order</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-plum-ink/40">Your cart is empty. Tap + on an item.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.lineId} className="text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-plum-ink">{l.name}</span>
                  <span className="font-semibold">{formatPeso(l.unitPrice * l.quantity)}</span>
                </div>
                {l.modifiers.length > 0 && <p className="text-xs text-plum-ink/50">{l.modifiers.map((m) => m.name).join(", ")}</p>}
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex items-center rounded-full border border-plum-ink/15">
                    <button onClick={() => setQty(l.lineId, -1)} className="px-2 text-lg">−</button>
                    <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                    <button onClick={() => setQty(l.lineId, 1)} className="px-2 text-lg">+</button>
                  </div>
                  <button onClick={() => setLines((p) => p.filter((x) => x.lineId !== l.lineId))} className="text-xs text-muted hover:text-guava">remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Checkout details */}
        {checkout && lines.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-black/5 pt-4">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
              {([["takeout", "🥡 Pickup"], ["delivery", "🛵 Delivery"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setOrderType(k)} className={`rounded-md py-2 text-sm font-semibold ${orderType === k ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>{label}</button>
              ))}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone number" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            {orderType === "delivery" && (
              <>
                {zones.length > 0 && (
                  <select value={zone} onChange={(e) => setZone(e.target.value)} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
                    <option value="">Select delivery zone…</option>
                    {zones.map((z) => (
                      <option key={z.name} value={z.name}>{z.name} — {formatPeso(z.fee)}</option>
                    ))}
                  </select>
                )}
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Delivery address" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                <div>
                  <p className="mb-1 text-xs font-semibold text-plum-ink/60">Pin your location (for the rider)</p>
                  <LocationPicker onChange={(lat, lng) => setGeo({ lat, lng })} />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-black/5 px-4 py-3">
        {checkout && orderType === "delivery" && (
          <div className="mb-1 space-y-0.5 text-sm text-plum-ink/60">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatPeso(subtotal)}</span></div>
            <div className="flex justify-between"><span>Delivery fee</span><span>{deliveryFee > 0 ? formatPeso(deliveryFee) : "—"}</span></div>
          </div>
        )}
        <div className="flex items-center justify-between font-heading text-xl font-extrabold text-plum-ink">
          <span>TOTAL</span><span>{formatPeso(total)}</span>
        </div>
        <p className="text-xs text-plum-ink/45">VAT (12%) included · {formatPeso(vat)}</p>
        {error && <p className="mt-2 text-sm text-guava">{error}</p>}
        {paused ? (
          <div className="mt-3 rounded-lg bg-plum-ink/5 px-3 py-2 text-center text-sm font-semibold text-plum-ink/60">
            🔒 Online ordering is paused — we&apos;re closed right now.
          </div>
        ) : !checkout ? (
          <button
            onClick={() => setCheckout(true)}
            disabled={lines.length === 0}
            className="mt-3 w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            Confirm Order
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={busy || lines.length === 0 || !name.trim() || !phone.trim() || (orderType === "delivery" && (!address.trim() || (zones.length > 0 && !zone)))}
            className="mt-3 w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Placing…" : `Place ${orderType === "delivery" ? "delivery" : "pickup"} order`}
          </button>
        )}
        {checkout && <p className="mt-2 text-center text-xs text-plum-ink/40">Pay on {orderType === "delivery" ? "delivery" : "pickup"}.</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-plum-ink text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={restaurantName} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 font-bold">{restaurantName.charAt(0)}</div>
          )}
          <span className="font-heading text-lg font-extrabold">{restaurantName}</span>
          {openNow != null && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${openNow ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/60"}`}>
              {openNow ? "● Open now" : "Closed"}
            </span>
          )}
          <nav className="ml-auto hidden items-center gap-5 text-sm font-semibold text-white/80 md:flex">
            <a href="#menu" className="hover:text-white">MENU</a>
            <a href="#info" className="hover:text-white">PAYMENT</a>
            <a href="#info" className="hover:text-white">DELIVERY</a>
            <a href="#info" className="hover:text-white">HOURS</a>
            <a href="#info" className="hover:text-white">CONTACT</a>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[230px_1fr_330px]">
        {/* Left sidebar */}
        <aside className="hidden lg:block">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-plum-ink/10 px-3 py-2 text-sm" />
          </div>
          <div className="mt-3 rounded-xl bg-white p-2 shadow-sm">
            <p className="px-2 py-1 font-heading text-xs font-bold uppercase tracking-wide text-plum-ink/50">Menu</p>
            <ul>
              {nonEmpty.map((c) => (
                <li key={c.id}>
                  <a href={`#cat-${c.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-plum-ink/80 hover:bg-gray-100">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-xs font-bold text-plum-ink/50">{c.name.charAt(0)}</span>
                    {c.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {loyalty?.enabled && (
            <div className="mt-3 rounded-xl bg-white p-4 text-center shadow-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-xl text-white">🔔</div>
              <p className="mt-2 text-sm font-semibold text-plum-ink">Special Offers</p>
              <p className="text-xs text-plum-ink/50">Earn points on every order</p>
            </div>
          )}
        </aside>

        {/* Center */}
        <main id="menu">
          {/* Mobile search */}
          <div className="mb-3 lg:hidden">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu…" className="w-full rounded-lg border border-plum-ink/10 bg-white px-3 py-2 text-sm" />
          </div>

          {/* Promo banner */}
          {loyalty?.enabled && (
            <div className="mb-4 overflow-hidden rounded-xl bg-gradient-to-r from-red-600 to-orange-500 p-5 text-white shadow">
              <p className="font-heading text-lg font-extrabold">Earn reward points 🎉</p>
              <p className="mt-1 text-sm text-white/90">
                Earn points on every order — ₱{loyalty.pesosPerPoint} spent = 1 point. Enter your phone at checkout to start earning.
              </p>
            </div>
          )}

          {shownCats.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-sm text-plum-ink/50">No items match your search.</p>}
          {shownCats.map((cat) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="mb-6 scroll-mt-20">
              <h2 className="mb-3 font-heading text-lg font-bold text-plum-ink">{cat.name}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cat.items.map((item) => (
                  <ProductCard key={item.id} item={item} onPick={pick} />
                ))}
              </div>
            </section>
          ))}

          {/* Info / footer */}
          <section id="info" className="mt-8 grid gap-4 rounded-xl bg-white p-5 text-sm text-plum-ink/70 shadow-sm sm:grid-cols-2">
            <div>
              <p className="font-heading font-bold text-plum-ink">Store hours</p>
              {hours && hours.length === 7 ? (
                <ul className="mt-1 space-y-0.5">
                  {hours.map((h, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{DAY_LABELS[i]}</span>
                      <span>{h.closed ? "Closed" : `${h.open}–${h.close}`}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">Contact us for hours.</p>
              )}
            </div>
            <div>
              <p className="font-heading font-bold text-plum-ink">Delivery</p>
              {zones.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {zones.map((z) => (
                    <li key={z.name} className="flex justify-between"><span>{z.name}</span><span>{formatPeso(z.fee)}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">Pickup available. Ask us about delivery.</p>
              )}
            </div>
            <div>
              <p className="font-heading font-bold text-plum-ink">Payment methods</p>
              <p className="mt-1">Cash on pickup / delivery.{payOnline ? " GCash & card available." : ""}</p>
            </div>
            <div>
              <p className="font-heading font-bold text-plum-ink">Contact</p>
              {contact?.address && <p className="mt-1">📍 {contact.address}</p>}
              {contact?.phone && <p>📞 {contact.phone}</p>}
              {!contact?.address && !contact?.phone && <p className="mt-1">Contact us in person or at the counter.</p>}
            </div>
          </section>
        </main>

        {/* Right cart (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 h-[calc(100vh-6rem)] overflow-hidden rounded-xl bg-white shadow-sm">
            {cartPanel}
          </div>
        </aside>
      </div>

      {/* Item config modal */}
      {configItem && <ItemConfig item={configItem} onAdd={(l) => { setLines((p) => [...p, l]); setConfigItem(null); }} onCancel={() => setConfigItem(null)} />}

      {/* Mobile cart bar + sheet */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3 lg:hidden">
          <button onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between rounded-full bg-green-600 px-5 py-3.5 font-semibold text-white shadow-lg">
            <span>{count} item{count > 1 ? "s" : ""}</span>
            <span>My order · {formatPeso(total)}</span>
          </button>
        </div>
      )}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 lg:hidden" onClick={() => setCartOpen(false)}>
          <div className="max-h-[88vh] w-full overflow-hidden rounded-t-2xl bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end p-2"><button onClick={() => setCartOpen(false)} className="px-3 text-2xl leading-none text-plum-ink/40">×</button></div>
            <div className="h-[70vh]">{cartPanel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
