"use client";

import { useMemo, useState } from "react";
import { formatPeso } from "@/lib/money";
import {
  deleteInventoryItem,
  recordWaste,
  recordCount,
  recordWithdrawal,
} from "@/server/inventory/actions";

export interface InventoryRow {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  costPerUnit: number; // centavos
  reorderLevel: number;
  low: boolean;
  supplierName: string | null;
}

/**
 * Ingredient list with search + a low-stock filter. Each row's stock actions
 * (take out / log waste / set counted) live behind a single "Adjust" toggle so
 * the table stays readable instead of showing six cramped inputs per row.
 */
export function InventoryTable({ items }: { items: InventoryRow[] }) {
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (lowOnly && !i.low) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.supplierName ?? "").toLowerCase().includes(q);
    });
  }, [items, query, lowOnly]);

  const lowCount = items.filter((i) => i.low).length;

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-plum-ink/10 p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-plum-ink/15 px-3 py-2">
          <span className="text-plum-ink/40" aria-hidden>🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ingredients or suppliers…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-plum-ink/40"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-plum-ink/40 hover:text-plum-ink" aria-label="Clear search">×</button>
          )}
        </div>
        <div className="flex rounded-lg bg-plum-ink/5 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setLowOnly(false)}
            className={`rounded-md px-3 py-1.5 ${!lowOnly ? "bg-white text-plum-ink shadow-sm" : "text-plum-ink/55"}`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setLowOnly(true)}
            className={`rounded-md px-3 py-1.5 ${lowOnly ? "bg-white text-guava shadow-sm" : "text-plum-ink/55"}`}
          >
            Low stock ({lowCount})
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="p-8 text-center text-sm text-plum-ink/45">
          {items.length === 0
            ? "No ingredients yet — add your first one below."
            : "No ingredients match your search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-plum-ink/10 text-[11px] uppercase tracking-wide text-plum-ink/45">
                <th className="px-4 py-2.5 font-semibold">Ingredient</th>
                <th className="px-3 py-2.5 text-right font-semibold">Stock</th>
                <th className="px-3 py-2.5 text-right font-semibold">Reorder at</th>
                <th className="px-3 py-2.5 text-right font-semibold">Cost/unit</th>
                <th className="px-3 py-2.5 text-right font-semibold">Value</th>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const open = openId === i.id;
                return (
                  <RowGroup key={i.id} item={i} open={open} onToggle={() => setOpenId(open ? null : i.id)} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RowGroup({ item: i, open, onToggle }: { item: InventoryRow; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className={`border-b border-plum-ink/[0.06] ${open ? "bg-cream/50" : ""}`}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-plum-ink">{i.name}</span>
            {i.low && (
              <span className="rounded-full bg-guava/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-guava">
                Low
              </span>
            )}
          </div>
          <span className="text-xs text-plum-ink/45">{i.supplierName ?? "No supplier"}</span>
        </td>
        <td className="px-3 py-3 text-right">
          <span className={`font-semibold tabular-nums ${i.low ? "text-guava" : "text-plum-ink"}`}>
            {i.stockQty}
          </span>
          <span className="text-plum-ink/45"> {i.unit}</span>
        </td>
        <td className="px-3 py-3 text-right tabular-nums text-plum-ink/60">{i.reorderLevel} {i.unit}</td>
        <td className="px-3 py-3 text-right tabular-nums text-plum-ink/70">{formatPeso(i.costPerUnit)}</td>
        <td className="px-3 py-3 text-right font-semibold tabular-nums text-plum-ink">
          {formatPeso(Math.round(i.stockQty * i.costPerUnit))}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              open ? "border-brand-primary text-brand-primary" : "border-plum-ink/15 text-plum-ink/70 hover:border-brand-primary hover:text-brand-primary"
            }`}
          >
            {open ? "Close" : "Adjust"} {open ? "▴" : "▾"}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="border-b border-plum-ink/10 bg-cream/50">
          <td colSpan={6} className="px-4 pb-4 pt-1">
            <div className="grid gap-3 sm:grid-cols-3">
              {/* Take out */}
              <form action={recordWithdrawal} className="rounded-lg border border-plum-ink/10 bg-white p-3">
                <p className="text-xs font-bold text-plum-ink">Take out</p>
                <p className="mb-2 text-[11px] text-plum-ink/45">Deduct stock used or requested.</p>
                <input type="hidden" name="id" value={i.id} />
                <div className="flex gap-1.5">
                  <input
                    name="qty"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={i.unit}
                    className="w-20 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
                  />
                  <input
                    name="note"
                    placeholder="What for?"
                    className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
                  />
                </div>
                <button className="mt-2 w-full rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white">
                  Take out
                </button>
              </form>

              {/* Waste */}
              <form action={recordWaste} className="rounded-lg border border-plum-ink/10 bg-white p-3">
                <p className="text-xs font-bold text-plum-ink">Log waste</p>
                <p className="mb-2 text-[11px] text-plum-ink/45">Spoiled or discarded stock.</p>
                <input type="hidden" name="id" value={i.id} />
                <input
                  name="qty"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Qty in ${i.unit}`}
                  className="w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
                />
                <button className="mt-2 w-full rounded-lg border border-guava/40 px-3 py-1.5 text-xs font-semibold text-guava">
                  Log waste
                </button>
              </form>

              {/* Count */}
              <form action={recordCount} className="rounded-lg border border-plum-ink/10 bg-white p-3">
                <p className="text-xs font-bold text-plum-ink">Stock count</p>
                <p className="mb-2 text-[11px] text-plum-ink/45">Set stock to the counted amount.</p>
                <input type="hidden" name="id" value={i.id} />
                <input
                  name="counted"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Actual ${i.unit} on hand`}
                  className="w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
                />
                <button className="mt-2 w-full rounded-lg border border-plum-ink/20 px-3 py-1.5 text-xs font-semibold text-plum-ink">
                  Set count
                </button>
              </form>
            </div>

            <form
              action={deleteInventoryItem}
              className="mt-3 flex justify-end"
              onSubmit={(e) => {
                if (!confirm(`Delete "${i.name}" from inventory? This can't be undone.`)) e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={i.id} />
              <button className="text-xs font-semibold text-plum-ink/45 hover:text-guava">
                Delete ingredient
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
