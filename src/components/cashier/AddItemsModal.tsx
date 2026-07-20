"use client";

import { useEffect, useState } from "react";
import { formatPeso } from "@/lib/money";
import { cartTotal } from "@/lib/cart/pricing";
import type { CartLine, DinerCategory, DinerItem } from "@/lib/cart/types";
import { getPosMenu, addItemsToOrder, type CashierTable } from "@/server/orders/cashier";
import { printKitchenTicket } from "@/server/printing/print";
import { runPrintDispatch } from "@/lib/print/run-dispatch";
import { ItemConfig, lineId } from "./NewOrderModal";
import { PosItemTile } from "./PosItemTile";

/**
 * Add more items to an existing open order — for when a customer orders, then
 * asks for another item a few minutes later. Reuses the POS item picker; the
 * server appends the items and bumps the total.
 */
export function AddItemsModal({
  orderId,
  label,
  onClose,
  onChanged,
}: {
  orderId: string;
  label: string;
  onClose: () => void;
  onChanged: (tables: CashierTable[]) => void;
}) {
  const [menu, setMenu] = useState<DinerCategory[] | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [configItem, setConfigItem] = useState<DinerItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getPosMenu()
      .then(setMenu)
      .catch(() => setLoadError("Couldn't load the menu. Please try again."));
  }, []);

  const total = cartTotal(lines);
  const nonEmpty = (menu ?? []).filter((c) => c.items.length > 0);

  function pickItem(item: DinerItem) {
    if (!item.isAvailable) return;
    if (item.groups.length === 0 && !(item.variants && item.variants.length > 0)) {
      setLines((prev) => [
        ...prev,
        { lineId: lineId(), itemId: item.id, name: item.name, basePrice: item.price, unitPrice: item.price, quantity: 1, modifiers: [] },
      ]);
    } else {
      setConfigItem(item);
    }
  }

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    const res = await addItemsToOrder(
      orderId,
      lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        note: l.note,
        modifierIds: l.modifiers.map((m) => m.modifierId),
        variantId: l.variantId,
      })),
    );
    setSubmitting(false);
    if (res.ok && res.tables) {
      onChanged(res.tables);
      if (res.printKitchen && res.printOrderId) {
        try {
          const k = await printKitchenTicket(res.printOrderId);
          await runPrintDispatch(k, res.printOrderId, "kitchen");
        } catch {
          /* non-blocking */
        }
      }
      onClose();
    } else {
      setSubmitError(res.error ?? "Could not add the items.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-screen w-full max-w-5xl flex-col bg-white sm:max-h-[90vh] sm:rounded-tile">
        <div className="flex items-center justify-between border-b border-plum-ink/10 p-4">
          <h2 className="font-heading text-xl font-bold">
            Add items — <span className="text-brand-primary">{label}</span>
          </h2>
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
              {nonEmpty.length === 0 && <p className="text-sm text-plum-ink/50">No menu items yet.</p>}
              {nonEmpty.map((cat) => (
                <section key={cat.id} className="mb-5">
                  <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">
                    {cat.name}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {cat.items.map((item) =>
                      configItem?.id === item.id ? (
                        <div key={item.id} className="col-span-2 sm:col-span-3 xl:col-span-4">
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
                        <PosItemTile key={item.id} item={item} onPick={pickItem} />
                      ),
                    )}
                  </div>
                </section>
              ))}
            </div>

            {/* Added items */}
            <div className="flex flex-col border-t border-plum-ink/10 md:border-l md:border-t-0">
              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
                  Items to add
                </p>
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
                            <p className="text-xs text-plum-ink/50">{l.modifiers.map((m) => m.name).join(", ")}</p>
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
                  <span>Adding</span>
                  <span>{formatPeso(total)}</span>
                </div>
                <button
                  onClick={submit}
                  disabled={submitting || lines.length === 0}
                  className="w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-50"
                >
                  {submitting ? "Adding…" : "Add to order"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
