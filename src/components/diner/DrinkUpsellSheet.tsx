"use client";

import type { DinerItem } from "@/lib/cart/types";

/** Peso format for the diner sheet (no server import needed). */
function peso(centavos: number) {
  return `₱${(centavos / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

/**
 * Shown right after a diner places an order that had no drinks — a friendly
 * nudge to add drinks & desserts. Picking an item opens the normal add modal so
 * any required options still apply; it becomes a quick follow-up order.
 */
export function DrinkUpsellSheet({
  items,
  onPick,
  onClose,
}: {
  items: DinerItem[];
  onPick: (item: DinerItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-plum-ink/15" />
        <h2 className="font-heading text-xl font-extrabold">Anything to drink? 🥤</h2>
        <p className="mt-1 text-sm text-plum-ink/60">
          Your order&apos;s in! Add a drink or dessert to go with it.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onPick(it)}
              className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white text-left transition hover:shadow-md"
            >
              {it.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.imageUrl} alt={it.name} className="h-24 w-full object-cover" />
              ) : (
                <div className="h-24 w-full" style={{ background: "var(--brand-gradient)", opacity: 0.12 }} />
              )}
              <div className="p-2.5">
                <p className="line-clamp-1 text-sm font-semibold text-plum-ink">{it.name}</p>
                <p className="mt-0.5 text-sm font-bold text-brand-primary">{peso(it.price)}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-plum-ink/15 py-3 text-sm font-semibold text-plum-ink/70"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
