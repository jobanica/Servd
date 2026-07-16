"use client";

import { useMemo, useState } from "react";
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
import { captureCartLead } from "@/server/marketing/cart-recovery";
import { LocationPicker } from "./LocationPicker";
import { WebOrderTracker } from "./WebOrderTracker";

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
  acceptsBookings?: boolean;
  bookHref?: string;
  scheduleFor?: string; // ISO — preselect "schedule for later" (from the pre-order page)
  booking?: {
    requireDownpayment: boolean;
    downpaymentType: "percent" | "fixed";
    downpaymentValue: number; // percent (0–100) or centavos
    downpaymentInstructions: string;
  };
  payment?: {
    codEnabled: boolean;
    gcashEnabled: boolean;
    gcashName: string;
    gcashNumber: string;
    gcashQrUrl: string;
  };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** ISO instant → { date:"YYYY-MM-DD", time:"HH:MM" } in PH wall-clock (UTC+8). */
function isoToPhParts(iso?: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return { date: "", time: "" };
  const ph = new Date(dt.getTime() + 8 * 3600000).toISOString();
  return { date: ph.slice(0, 10), time: ph.slice(11, 16) };
}

/** PH date+time inputs → the matching UTC ISO instant (PH is a fixed UTC+8). */
function phPartsToIso(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const dt = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

/** "09:00" → "9:00 AM" for a cleaner, customer-facing time. */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, "0")} ${period}`;
}

/** Collapse consecutive identical days into ranges (e.g. "Mon–Fri · 9 AM–9 PM"). */
function groupHours(hours: DayHours[]): { label: string; value: string }[] {
  if (hours.length !== 7) return [];
  const key = (h: DayHours) => (h.closed ? "closed" : `${h.open}-${h.close}`);
  const rows: { label: string; value: string }[] = [];
  let start = 0;
  for (let i = 1; i <= 7; i++) {
    if (i < 7 && key(hours[i]) === key(hours[start])) continue;
    const h = hours[start];
    const range = start === i - 1 ? DAY_LABELS[start] : `${DAY_LABELS[start]}–${DAY_LABELS[i - 1]}`;
    const label = start === 0 && i === 7 ? "Every day" : range;
    rows.push({ label, value: h.closed ? "Closed" : `${to12h(h.open)} – ${to12h(h.close)}` });
    start = i;
  }
  return rows;
}

/** Inline modifier/quantity picker (no i18n dependency). */
function ItemConfig({ item, onAdd, onCancel }: { item: DinerItem; onAdd: (l: CartLine) => void; onCancel: () => void }) {
  const variants = item.variants ?? [];
  const inStock = (v: { stock?: number | null }) => v.stock == null || v.stock > 0;
  const [variantId, setVariantId] = useState<string>((variants.find(inStock) ?? variants[0])?.id ?? "");
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showError, setShowError] = useState(false);
  const chosenVariant = variants.find((v) => v.id === variantId) ?? null;
  const variantOut = !!chosenVariant && !inStock(chosenVariant);
  const effItem = useMemo(() => (chosenVariant ? { ...item, price: chosenVariant.price } : item), [item, chosenVariant]);
  const price = useMemo(() => unitPrice(effItem, selection), [effItem, selection]);
  const error = useMemo(() => validateSelection(effItem, selection), [effItem, selection]);

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
    if (error || variantOut) return setShowError(true);
    onAdd({
      lineId: lineId(),
      itemId: item.id,
      name: chosenVariant ? `${item.name} (${chosenVariant.name})` : item.name,
      basePrice: effItem.price,
      unitPrice: price,
      quantity,
      modifiers: selectionToLineModifiers(effItem, selection),
      note: note.trim() || undefined,
      variantId: chosenVariant?.id,
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
        {variants.length > 0 && (
          <fieldset className="mt-4">
            <legend className="font-semibold text-plum-ink">Size <span className="text-guava">*</span></legend>
            <div className="mt-2 space-y-1">
              {variants.map((v) => {
                const out = !inStock(v);
                return (
                  <label key={v.id} className={`flex items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2 text-sm ${out ? "opacity-50" : ""}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="__variant" disabled={out} checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                      {v.name}
                      {out ? (
                        <span className="text-xs font-semibold text-guava">Sold out</span>
                      ) : v.stock != null ? (
                        <span className="text-xs text-plum-ink/45">{v.stock} left</span>
                      ) : null}
                    </span>
                    <span className="font-semibold text-plum-ink">{formatPeso(v.price)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
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
          <button onClick={add} disabled={!!error || variantOut} className="flex-1 rounded-full bg-red-600 py-3 font-semibold text-white disabled:opacity-50">
            {variantOut ? "Sold out" : `Add · ${formatPeso(price * quantity)}`}
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
        <span className="font-bold text-plum-ink">
          {item.variants && item.variants.length > 0 && <span className="text-xs font-medium text-plum-ink/50">from </span>}
          {formatPeso(item.price)}
        </span>
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
  const { slug, restaurantName, logoUrl, categories, contact, payOnline, loyalty, hours, zones = [], openNow, pauseWhenClosed, acceptsBookings, bookHref } = props;
  const home = props.homeHref ?? `/r/${slug}`;
  const book = bookHref ?? `/r/${slug}/book`;
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

  // Advance ordering ("order now for later"). Enabled alongside table bookings.
  const canSchedule = !!acceptsBookings;
  const initSched = useMemo(() => isoToPhParts(props.scheduleFor), [props.scheduleFor]);
  const todayPh = useMemo(() => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), []);
  const [schedMode, setSchedMode] = useState<"asap" | "later">(props.scheduleFor ? "later" : "asap");
  const [schedDate, setSchedDate] = useState(initSched.date);
  const [schedTime, setSchedTime] = useState(initSched.time);
  const [downpaymentRef, setDownpaymentRef] = useState("");
  // Confirmation details for an advance order awaiting the owner's approval.
  const [placedAdvance, setPlacedAdvance] = useState<{ downpayment: number } | null>(null);
  // Payment method (cash / manual GCash). GCash only offered if the owner set it up.
  const pay = props.payment;
  const gcashAvailable = !!pay?.gcashEnabled && !!pay?.gcashQrUrl;
  const [payMethod, setPayMethod] = useState<"cod" | "gcash">(
    pay && pay.codEnabled === false && gcashAvailable ? "gcash" : "cod",
  );
  const [gcashRef, setGcashRef] = useState("");

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
    // Items with modifiers OR sizes need the picker; only plain items shortcut.
    if (item.groups.length === 0 && !(item.variants && item.variants.length > 0)) {
      setLines((p) => [...p, { lineId: lineId(), itemId: item.id, name: item.name, basePrice: item.price, unitPrice: item.price, quantity: 1, modifiers: [] }]);
    } else setConfigItem(item);
  }
  function setQty(id: string, delta: number) {
    setLines((p) =>
      p.flatMap((l) => (l.lineId === id ? (l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]) : [l])),
    );
  }

  // When closed + paused, an advance order is still allowed — force "later".
  const forceLater = canSchedule && paused;
  const effectiveSchedMode: "asap" | "later" = forceLater ? "later" : schedMode;
  const schedulingLater = canSchedule && effectiveSchedMode === "later";
  const scheduledIso = schedulingLater ? phPartsToIso(schedDate, schedTime) : undefined;
  // Downpayment the customer will owe on this advance order (mirror of the server
  // calc; the server recomputes authoritatively).
  const bk = props.booking;
  const downpaymentDue = schedulingLater && bk?.requireDownpayment
    ? Math.max(0, Math.min(total, bk.downpaymentType === "percent" ? Math.round((total * bk.downpaymentValue) / 100) : bk.downpaymentValue))
    : 0;

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
      scheduledFor: scheduledIso,
      downpaymentRef: schedulingLater && downpaymentDue > 0 ? downpaymentRef || undefined : undefined,
      paymentChoice: gcashAvailable ? payMethod : undefined,
      paymentRef: payMethod === "gcash" ? gcashRef || undefined : undefined,
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, modifierIds: l.modifiers.map((m) => m.modifierId), variantId: l.variantId })),
    });
    setBusy(false);
    if (res.ok) {
      if (res.awaitingApproval) setPlacedAdvance({ downpayment: res.downpaymentAmount });
      setPlacedId(res.orderId);
    } else setError(res.error);
  }

  // Advance orders don't have a live status yet — they wait for the owner to
  // approve. Show a clear confirmation (with any downpayment steps) instead of
  // the live order tracker.
  if (placedId && placedAdvance) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="sticky top-0 z-30 bg-plum-ink text-white">
          <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
            <span className="font-heading text-lg font-extrabold">{restaurantName}</span>
            <a href={home} className="ml-auto text-sm font-semibold text-white/80 hover:text-white">← Menu</a>
          </div>
        </header>
        <div className="mx-auto max-w-lg p-4">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
            <h1 className="font-heading text-2xl font-bold text-plum-ink">Advance order received!</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-plum-ink/60">
              Thanks, {name.trim() || "friend"}. Your order for{" "}
              <span className="font-semibold text-plum-ink/80">
                {scheduledIso ? new Date(scheduledIso).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "your chosen time"}
              </span>{" "}
              is now pending the restaurant&apos;s approval. We&apos;ll contact you on {phone || "your number"} to confirm.
            </p>
            {placedAdvance.downpayment > 0 && (
              <div className="mt-4 rounded-xl bg-mango/10 p-4 text-left">
                <p className="font-heading font-bold text-plum-ink">Downpayment to confirm: {formatPeso(placedAdvance.downpayment)}</p>
                {bk?.downpaymentInstructions ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-plum-ink/70">{bk.downpaymentInstructions}</p>
                ) : (
                  <p className="mt-1 text-sm text-plum-ink/70">Please settle the downpayment to secure your order; the restaurant will confirm once received.</p>
                )}
                {downpaymentRef && <p className="mt-2 text-xs text-plum-ink/50">Your reference: <span className="font-semibold text-plum-ink/70">{downpaymentRef}</span></p>}
              </div>
            )}
            <a href={home} className="mt-6 inline-block rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white">Back to menu</a>
          </div>
        </div>
      </div>
    );
  }

  if (placedId) {
    return (
      <WebOrderTracker
        slug={slug}
        orderId={placedId}
        orderType={orderType}
        restaurantName={restaurantName}
        phone={phone}
        homeHref={home}
      />
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

            {/* When — order now, or schedule it for a future date/time. */}
            {canSchedule && (
              <div className="rounded-lg border border-plum-ink/10 p-2">
                {forceLater ? (
                  <p className="px-1 pb-1.5 text-xs font-semibold text-plum-ink/60">
                    🔒 We&apos;re closed right now — schedule your order for later:
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
                    <button type="button" onClick={() => setSchedMode("asap")} className={`rounded-md py-1.5 text-xs font-semibold ${effectiveSchedMode === "asap" ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>⏱ As soon as possible</button>
                    <button type="button" onClick={() => setSchedMode("later")} className={`rounded-md py-1.5 text-xs font-semibold ${effectiveSchedMode === "later" ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>📅 Schedule for later</button>
                  </div>
                )}
                {effectiveSchedMode === "later" && (
                  <div className="mt-2 flex gap-2">
                    <input type="date" min={todayPh} value={schedDate} onChange={(e) => setSchedDate(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm" />
                    <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm" />
                  </div>
                )}
                {schedulingLater && (
                  <p className="mt-2 px-1 text-xs text-plum-ink/50">📋 Advance orders are confirmed once the restaurant approves them.</p>
                )}
                {schedulingLater && downpaymentDue > 0 && (
                  <div className="mt-2 rounded-lg bg-mango/10 p-2">
                    <p className="text-xs font-bold text-plum-ink">
                      Downpayment to confirm: {formatPeso(downpaymentDue)}
                      {bk?.downpaymentType === "percent" ? ` (${bk.downpaymentValue}% of ${formatPeso(total)})` : ""}
                    </p>
                    {bk?.downpaymentInstructions && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-plum-ink/65">{bk.downpaymentInstructions}</p>
                    )}
                    <input
                      value={downpaymentRef}
                      onChange={(e) => setDownpaymentRef(e.target.value)}
                      placeholder="Payment reference (e.g. GCash ref no.)"
                      className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            )}

            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                // Capture an abandoned-cart lead once a usable phone is entered.
                if (phone.replace(/[^\d+]/g, "").length >= 7 && lines.length > 0) {
                  captureCartLead({ slug, name, phone, itemCount: lines.length, total: subtotal }).catch(() => {});
                }
              }}
              inputMode="tel"
              placeholder="Phone number"
              className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
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
                  <p className="mb-1 text-xs font-semibold text-plum-ink/60">Pin your location (required for delivery)</p>
                  <LocationPicker onChange={(lat, lng) => setGeo({ lat, lng })} />
                  {!geo && <p className="mt-1 text-xs text-guava">Please pin your location to place a delivery order.</p>}
                </div>
              </>
            )}

            {/* Payment method — only a choice when the owner offers GCash too. */}
            {gcashAvailable && (
              <div>
                <p className="mb-1 text-xs font-semibold text-plum-ink/60">Payment</p>
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
                  {pay?.codEnabled !== false && (
                    <button type="button" onClick={() => setPayMethod("cod")} className={`rounded-md py-2 text-sm font-semibold ${payMethod === "cod" ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>
                      💵 {orderType === "delivery" ? "Cash on delivery" : "Cash on pickup"}
                    </button>
                  )}
                  <button type="button" onClick={() => setPayMethod("gcash")} className={`rounded-md py-2 text-sm font-semibold ${payMethod === "gcash" ? "bg-white text-blue-600 shadow-sm" : "text-plum-ink/60"} ${pay?.codEnabled === false ? "col-span-2" : ""}`}>
                    📱 GCash
                  </button>
                </div>
                {payMethod === "gcash" && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-center">
                    <p className="text-xs font-semibold text-plum-ink/70">Scan to pay {formatPeso(total)}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pay!.gcashQrUrl} alt="GCash QR" className="mx-auto mt-2 h-44 w-44 rounded-lg border border-plum-ink/10 bg-white object-contain" />
                    {(pay!.gcashName || pay!.gcashNumber) && (
                      <p className="mt-2 text-xs text-plum-ink/60">
                        {pay!.gcashName}{pay!.gcashName && pay!.gcashNumber ? " · " : ""}{pay!.gcashNumber}
                      </p>
                    )}
                    <input
                      value={gcashRef}
                      onChange={(e) => setGcashRef(e.target.value)}
                      placeholder="Enter your GCash reference no."
                      className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-plum-ink/45">Pay, then enter the reference so we can confirm your order.</p>
                  </div>
                )}
              </div>
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
        {paused && !canSchedule ? (
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
            disabled={busy || lines.length === 0 || !name.trim() || !phone.trim() || (schedulingLater && !scheduledIso) || (gcashAvailable && payMethod === "gcash" && !gcashRef.trim()) || (orderType === "delivery" && (!address.trim() || !geo || (zones.length > 0 && !zone)))}
            className="mt-3 w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? "Placing…"
              : schedulingLater
                ? `Schedule ${orderType === "delivery" ? "delivery" : "pickup"} order`
                : `Place ${orderType === "delivery" ? "delivery" : "pickup"} order`}
          </button>
        )}
        {checkout && (
          <p className="mt-2 text-center text-xs text-plum-ink/40">
            {schedulingLater && scheduledIso
              ? `For ${new Date(scheduledIso).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · `
              : ""}
            {payMethod === "gcash" && gcashAvailable
              ? "Paying via GCash."
              : `Pay on ${orderType === "delivery" ? "delivery" : "pickup"}.`}
          </p>
        )}
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
            {acceptsBookings && (
              <a href={book} className="rounded-full bg-white px-3.5 py-1.5 font-bold text-plum-ink hover:bg-white/90">
                📅 Book / Order ahead
              </a>
            )}
          </nav>
          {acceptsBookings && (
            <a href={book} className="ml-auto rounded-full bg-white px-3 py-1.5 text-xs font-bold text-plum-ink md:hidden">
              📅 Book
            </a>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[230px_1fr_330px]">
        {/* Left sidebar — sticky so the categories stay visible while you scroll
            the menu (and after jumping to a category). */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-3 overflow-y-auto pb-4">
            <div className="rounded-xl bg-white p-3 shadow-sm">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-plum-ink/10 px-3 py-2 text-sm" />
            </div>
            <div className="rounded-xl bg-white p-2 shadow-sm">
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
              <div className="rounded-xl bg-white p-4 text-center shadow-sm">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-xl text-white">🔔</div>
                <p className="mt-2 text-sm font-semibold text-plum-ink">Special Offers</p>
                <p className="text-xs text-plum-ink/50">Earn points on every order</p>
              </div>
            )}
          </div>
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
          <section id="info" className="mt-8 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-plum-ink/5">
            <div className="grid gap-px bg-plum-ink/[0.06] sm:grid-cols-2">
              {/* Hours */}
              <div className="bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-plum-ink/40">Store hours</h3>
                  {typeof openNow === "boolean" && (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        openNow ? "bg-green-100 text-green-700" : "bg-plum-ink/10 text-plum-ink/50"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${openNow ? "bg-green-500" : "bg-plum-ink/40"}`} />
                      {openNow ? "Open now" : "Closed now"}
                    </span>
                  )}
                </div>
                {(() => {
                  const grouped = groupHours(hours ?? []);
                  return grouped.length ? (
                    <table className="mt-2.5 w-full text-sm">
                      <tbody>
                        {grouped.map((r, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-4 text-plum-ink/55">{r.label}</td>
                            <td className="py-1 text-right font-medium tabular-nums text-plum-ink/80">{r.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="mt-2.5 text-sm text-plum-ink/60">Please contact us for our opening hours.</p>
                  );
                })()}
              </div>

              {/* Ordering options */}
              <div className="bg-white p-5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-plum-ink/40">Ordering &amp; delivery</h3>
                {zones.length > 0 ? (
                  <>
                    <p className="mt-2.5 text-sm text-plum-ink/70">Pickup &amp; delivery available. Delivery fee by area:</p>
                    <table className="mt-1.5 w-full text-sm">
                      <tbody>
                        {zones.map((z) => (
                          <tr key={z.name}>
                            <td className="py-1 pr-4 text-plum-ink/55">{z.name}</td>
                            <td className="py-1 text-right font-medium tabular-nums text-plum-ink/80">{formatPeso(z.fee)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="mt-2.5 text-sm text-plum-ink/70">
                    Available for pickup and delivery. For delivery, place your order and we&apos;ll confirm
                    availability and any fee for your area.
                  </p>
                )}
              </div>

              {/* Payment */}
              <div className="bg-white p-5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-plum-ink/40">Payment</h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {["Cash", ...(payOnline ? ["GCash", "Card"] : [])].map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-plum-ink/10 bg-cream/60 px-3 py-1 text-xs font-semibold text-plum-ink/70"
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-plum-ink/45">Payable on pickup or delivery.</p>
              </div>

              {/* Contact */}
              <div className="bg-white p-5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-plum-ink/40">Contact</h3>
                <div className="mt-2.5 space-y-1.5 text-sm">
                  {contact?.address && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 text-plum-ink/75 hover:text-brand-primary"
                    >
                      <span aria-hidden>📍</span>
                      <span>{contact.address}</span>
                    </a>
                  )}
                  {contact?.phone && (
                    <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 text-plum-ink/75 hover:text-brand-primary">
                      <span aria-hidden>📞</span>
                      <span className="font-medium">{contact.phone}</span>
                    </a>
                  )}
                  {!contact?.address && !contact?.phone && (
                    <p className="text-plum-ink/60">Please contact us at the counter.</p>
                  )}
                </div>
              </div>
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
