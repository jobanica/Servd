"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPeso, formatDelta } from "@/lib/money";
import {
  unitPrice,
  validateSelection,
  selectionToLineModifiers,
  cartTotal,
} from "@/lib/cart/pricing";
import type { CartLine, DinerCategory, DinerItem, Selection } from "@/lib/cart/types";
import {
  getPosMenu,
  getPosTables,
  createCashierOrder,
  type CashierTable,
} from "@/server/orders/cashier";

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Inline modifier/quantity picker for one menu item (no i18n dependency). */
function ItemConfig({
  item,
  onAdd,
  onCancel,
}: {
  item: DinerItem;
  onAdd: (line: CartLine) => void;
  onCancel: () => void;
}) {
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showError, setShowError] = useState(false);

  const price = useMemo(() => unitPrice(item, selection), [item, selection]);
  const error = useMemo(() => validateSelection(item, selection), [item, selection]);

  function toggle(groupId: string, modId: string, single: boolean, max: number) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [modId] };
      if (current.includes(modId)) return { ...prev, [groupId]: current.filter((m) => m !== modId) };
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, modId] };
    });
  }

  function add() {
    if (error) {
      setShowError(true);
      return;
    }
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
    <div className="rounded-lg border border-plum-ink/15 bg-cream/40 p-3">
      <div className="flex items-start justify-between">
        <span className="font-semibold text-plum-ink">{item.name}</span>
        <button onClick={onCancel} className="text-sm text-plum-ink/40">
          ×
        </button>
      </div>

      {item.groups.map((group) => {
        const single = group.maxSelect === 1;
        const chosen = selection[group.id] ?? [];
        return (
          <fieldset key={group.id} className="mt-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-plum-ink/50">
              {group.name} {group.required && <span className="text-guava">*</span>}
            </legend>
            <div className="mt-1 space-y-1">
              {group.modifiers.map((mod) => (
                <label
                  key={mod.id}
                  className="flex items-center justify-between rounded-md border border-plum-ink/10 bg-white px-2 py-1 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`${item.id}-${group.id}`}
                      checked={chosen.includes(mod.id)}
                      onChange={() => toggle(group.id, mod.id, single, group.maxSelect)}
                    />
                    {mod.name}
                  </span>
                  {mod.priceDelta !== 0 && (
                    <span className="text-brand-primary">{formatDelta(mod.priceDelta)}</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="mt-3 w-full rounded-md border border-plum-ink/15 px-2 py-1 text-sm"
      />

      {showError && error && <p className="mt-2 text-xs text-guava">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center rounded-full border border-plum-ink/15">
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-2 py-1">
            −
          </button>
          <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
          <button onClick={() => setQuantity((q) => q + 1)} className="px-2 py-1">
            +
          </button>
        </div>
        <button
          onClick={add}
          disabled={!!error}
          className="flex-1 rounded-full py-2 text-sm font-semibold btn-brand disabled:opacity-50"
        >
          Add · {formatPeso(price * quantity)}
        </button>
      </div>
    </div>
  );
}

export function NewOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (tables: CashierTable[]) => void;
}) {
  const [menu, setMenu] = useState<DinerCategory[] | null>(null);
  const [tables, setTables] = useState<{ id: string; tableNumber: string }[]>([]);
  const [tableId, setTableId] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeout" | "delivery">("dine_in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [configItem, setConfigItem] = useState<DinerItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, t] = await Promise.all([getPosMenu(), getPosTables()]);
        setMenu(m);
        setTables(t);
        if (t.length === 1) setTableId(t[0].id);
      } catch {
        setLoadError("Couldn't load the menu. Please try again.");
      }
    })();
  }, []);

  const total = cartTotal(lines);
  const nonEmpty = (menu ?? []).filter((c) => c.items.length > 0);

  function pickItem(item: DinerItem) {
    if (!item.isAvailable) return;
    // No modifiers → add straight away; otherwise open the config panel.
    if (item.groups.length === 0) {
      setLines((prev) => [
        ...prev,
        {
          lineId: lineId(),
          itemId: item.id,
          name: item.name,
          basePrice: item.price,
          unitPrice: item.price,
          quantity: 1,
          modifiers: [],
        },
      ]);
    } else {
      setConfigItem(item);
    }
  }

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    const res = await createCashierOrder({
      orderType,
      tableId: orderType === "dine_in" ? tableId : undefined,
      customerName: orderType === "dine_in" ? undefined : customerName,
      customerPhone: orderType === "dine_in" ? undefined : customerPhone,
      customerAddress: orderType === "delivery" ? customerAddress : undefined,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        note: l.note,
        modifierIds: l.modifiers.map((m) => m.modifierId),
      })),
    });
    setSubmitting(false);
    if (res.ok && res.tables) {
      onCreated(res.tables);
      onClose();
    } else {
      setSubmitError(res.error ?? "Could not create the order.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-screen w-full max-w-5xl flex-col bg-white sm:max-h-[90vh] sm:rounded-tile">
        <div className="flex items-center justify-between border-b border-plum-ink/10 p-4">
          <h2 className="font-heading text-xl font-bold">New order (POS)</h2>
          <button onClick={onClose} className="text-2xl leading-none text-plum-ink/40" aria-label="Close">
            ×
          </button>
        </div>

        {loadError ? (
          <p className="p-6 text-sm text-guava">{loadError}</p>
        ) : !menu ? (
          <p className="p-6 text-sm text-plum-ink/50">Loading menu…</p>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_320px]">
            {/* Menu */}
            <div className="overflow-y-auto p-4">
              {nonEmpty.length === 0 && (
                <p className="text-sm text-plum-ink/50">No menu items yet.</p>
              )}
              {nonEmpty.map((cat) => (
                <section key={cat.id} className="mb-5">
                  <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">
                    {cat.name}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                    {cat.items.map((item) =>
                      configItem?.id === item.id ? (
                        <div key={item.id} className="col-span-2 lg:col-span-3">
                          <ItemConfig
                            item={item}
                            onAdd={(line) => {
                              setLines((prev) => [...prev, line]);
                              setConfigItem(null);
                            }}
                            onCancel={() => setConfigItem(null)}
                          />
                        </div>
                      ) : (
                        <button
                          key={item.id}
                          disabled={!item.isAvailable}
                          onClick={() => pickItem(item)}
                          className="rounded-lg border border-plum-ink/10 bg-white p-2 text-left text-sm hover:border-brand-primary disabled:opacity-40"
                        >
                          <span className="block font-medium text-plum-ink">{item.name}</span>
                          <span className="text-plum-ink/55">{formatPeso(item.price)}</span>
                          {!item.isAvailable && (
                            <span className="ml-1 text-xs text-muted">· sold out</span>
                          )}
                        </button>
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>

            {/* Order summary */}
            <div className="flex flex-col border-t border-plum-ink/10 md:border-l md:border-t-0">
              <div className="space-y-3 border-b border-plum-ink/10 p-4">
                {/* Order type */}
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-cream/60 p-1">
                  {([
                    ["dine_in", "Dine-in"],
                    ["takeout", "Pickup"],
                    ["delivery", "Delivery"],
                  ] as const).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setOrderType(k)}
                      className={`rounded-md py-1.5 text-xs font-semibold ${
                        orderType === k ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {orderType === "dine_in" ? (
                  <select
                    value={tableId}
                    onChange={(e) => setTableId(e.target.value)}
                    className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                  >
                    <option value="">Select a table…</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.tableNumber}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                    {orderType === "delivery" && (
                      <textarea
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        rows={2}
                        placeholder="Delivery address"
                        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {lines.length === 0 ? (
                  <p className="text-sm text-plum-ink/40">No items yet. Tap menu items to add.</p>
                ) : (
                  <ul className="space-y-2">
                    {lines.map((l) => (
                      <li key={l.lineId} className="flex items-start justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">
                            {l.quantity}× {l.name}
                          </span>
                          {l.modifiers.length > 0 && (
                            <p className="text-xs text-plum-ink/50">
                              {l.modifiers.map((m) => m.name).join(", ")}
                            </p>
                          )}
                          {l.note && <p className="text-xs italic text-plum-ink/50">“{l.note}”</p>}
                        </div>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-semibold">{formatPeso(l.unitPrice * l.quantity)}</span>
                          <button
                            onClick={() => setLines((prev) => prev.filter((x) => x.lineId !== l.lineId))}
                            className="text-xs text-muted hover:text-guava"
                          >
                            remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-plum-ink/10 p-4">
                {submitError && <p className="mb-2 text-sm text-guava">{submitError}</p>}
                <div className="mb-3 flex justify-between font-heading text-lg font-bold">
                  <span>Total</span>
                  <span>{formatPeso(total)}</span>
                </div>
                <button
                  onClick={submit}
                  disabled={
                    submitting ||
                    lines.length === 0 ||
                    (orderType === "dine_in" && !tableId) ||
                    (orderType !== "dine_in" && !customerName.trim()) ||
                    (orderType === "delivery" && !customerAddress.trim())
                  }
                  className="w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-50"
                >
                  {submitting ? "Sending to kitchen…" : "Send to kitchen"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
