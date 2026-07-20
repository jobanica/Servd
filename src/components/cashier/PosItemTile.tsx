"use client";

import { formatPeso } from "@/lib/money";
import type { DinerItem } from "@/lib/cart/types";

// Soft, deterministic tile colors for items without a photo — so the grid still
// reads as colorful cards (like a classic POS) instead of blank boxes.
const TILE_COLORS = [
  "bg-brand-primary/15 text-brand-primary",
  "bg-mango/20 text-plum-ink",
  "bg-guava/15 text-guava",
  "bg-emerald-500/15 text-emerald-700",
  "bg-sky-500/15 text-sky-700",
  "bg-violet-500/15 text-violet-700",
  "bg-amber-500/20 text-amber-800",
  "bg-rose-500/15 text-rose-700",
];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/**
 * One image-forward menu tile for the cashier POS grid — a photo (or a colored
 * placeholder with the name) with the item name + price overlaid, so staff can
 * order by tapping pictures, like a classic touchscreen POS.
 */
export function PosItemTile({ item, onPick }: { item: DinerItem; onPick: (item: DinerItem) => void }) {
  const soldOut = !item.isAvailable;
  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onPick(item)}
      className="group relative aspect-square overflow-hidden rounded-lg border border-plum-ink/10 text-left transition hover:border-brand-primary disabled:opacity-50"
    >
      {item.imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Gradient keeps the label readable over any photo. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-1.5 pt-6">
            <p className="line-clamp-2 text-xs font-semibold leading-tight text-white">{item.name}</p>
            <p className="text-[11px] font-bold text-white/90">{formatPeso(item.price)}</p>
          </div>
        </>
      ) : (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 ${colorFor(item.id)}`}>
          <span className="line-clamp-3 text-center text-sm font-bold leading-tight">{item.name}</span>
          <span className="text-xs font-bold opacity-80">{formatPeso(item.price)}</span>
        </div>
      )}

      {soldOut && (
        <span className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
          Sold out
        </span>
      )}
    </button>
  );
}
