"use client";

import { formatPeso } from "@/lib/money";
import { cartTotal } from "@/lib/cart/pricing";
import type { CartLine } from "@/lib/cart/types";

export function CartDrawer({
  lines,
  onSetQty,
  onRemove,
  onClose,
}: {
  lines: CartLine[];
  onSetQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  onClose: () => void;
}) {
  const total = cartTotal(lines);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 sm:rounded-tile">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-brand-ink">
            Your order
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
            Your cart is empty.
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
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="mt-4 border-t border-plum-ink/10 pt-4">
            <div className="flex justify-between font-heading text-lg font-bold">
              <span>Total</span>
              <span>{formatPeso(total)}</span>
            </div>
            <button
              className="mt-4 w-full rounded-full py-3 font-semibold btn-brand"
              // Placing the order is Phase 5.
              disabled
            >
              Place order (Phase 5)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
