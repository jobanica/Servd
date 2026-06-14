"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatPeso } from "@/lib/money";
import { cartTotal } from "@/lib/cart/pricing";
import type { CartLine } from "@/lib/cart/types";
import type { PlaceOrderResult } from "@/lib/validation/order";

export function CartDrawer({
  lines,
  onSetQty,
  onRemove,
  onClose,
  onPlaceOrder,
  onPlaced,
}: {
  lines: CartLine[];
  onSetQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onClose: () => void;
  onPlaceOrder: () => Promise<PlaceOrderResult>;
  onPlaced: () => void;
}) {
  const total = cartTotal(lines);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const t = useTranslations("cart");

  async function handlePlace() {
    setSubmitting(true);
    setError(null);
    const result = await onPlaceOrder();
    setSubmitting(false);
    if (result.ok) {
      setPlacedId(result.orderId);
      onPlaced(); // clear the cart
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 sm:rounded-tile">
        {placedId ? (
          // Success state
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
              ✓
            </div>
            <h2 className="mt-4 font-heading text-xl font-bold text-brand-ink">
              {t("orderSent")}
            </h2>
            <p className="mt-1 text-sm text-brand-ink/60">
              {t("reference", { ref: placedId.slice(0, 8) })}
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-full py-3 font-semibold btn-brand"
            >
              {t("done")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-brand-ink">
                {t("yourOrder")}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-2xl leading-none text-plum-ink/40"
              >
                ×
              </button>
            </div>

            {lines.length === 0 ? (
              <p className="mt-6 text-center text-sm text-plum-ink/50">
                {t("empty")}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-plum-ink/5">
                {lines.map((line) => (
                  <li key={line.lineId} className="py-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-brand-ink">
                        {line.name}
                      </span>
                      <span className="font-semibold">
                        {formatPeso(line.unitPrice * line.quantity)}
                      </span>
                    </div>
                    {line.modifiers.length > 0 && (
                      <p className="text-xs text-plum-ink/50">
                        {line.modifiers.map((m) => m.name).join(", ")}
                      </p>
                    )}
                    {line.note && (
                      <p className="text-xs italic text-plum-ink/50">
                        “{line.note}”
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center rounded-full border border-plum-ink/15">
                        <button
                          onClick={() => onSetQty(line.lineId, line.quantity - 1)}
                          className="px-3 py-1 text-lg"
                          aria-label="Decrease"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => onSetQty(line.lineId, line.quantity + 1)}
                          className="px-3 py-1 text-lg"
                          aria-label="Increase"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => onRemove(line.lineId)}
                        className="text-xs text-muted hover:text-guava"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="mt-3 text-sm text-guava">{error}</p>}

            {lines.length > 0 && (
              <div className="mt-4 border-t border-plum-ink/10 pt-4">
                <div className="flex justify-between font-heading text-lg font-bold">
                  <span>{t("total")}</span>
                  <span>{formatPeso(total)}</span>
                </div>
                <button
                  onClick={handlePlace}
                  disabled={submitting}
                  className="mt-4 w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-60"
                >
                  {submitting ? t("sending") : t("placeOrder")}
                </button>
                <p className="mt-2 text-center text-xs text-brand-ink/40">
                  {t("payNote")}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
