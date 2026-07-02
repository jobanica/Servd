"use client";

import { useState } from "react";
import { saveItemVariants } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

type Row = { name: string; price: string; stock: string };

/**
 * Editor for an item's sizes/variants (e.g. fish/pork by size or weight): a list
 * of name + price rows. Saving replaces the whole list. When an item has sizes,
 * the customer must pick one and it sets the price — no modifiers needed.
 */
export function VariantEditor({
  itemId,
  initial,
}: {
  itemId: string;
  initial: { name: string; price: number; stock?: number | null }[];
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.length > 0
      ? initial.map((v) => ({
          name: v.name,
          price: (v.price / 100).toFixed(2),
          stock: v.stock == null ? "" : String(v.stock),
        }))
      : [{ name: "", price: "", stock: "" }],
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { name: "", price: "", stock: "" }]);
  }
  function removeRow(i: number) {
    setRows((r) => (r.length <= 1 ? [{ name: "", price: "", stock: "" }] : r.filter((_, j) => j !== i)));
  }

  return (
    <form action={saveItemVariants} className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <input type="hidden" name="id" value={itemId} />
      <h2 className="font-heading text-lg font-bold">Sizes &amp; prices</h2>
      <p className="mt-0.5 text-sm text-plum-ink/55">
        For items sold in more than one size or weight (e.g. fish, pork). Add each size with its own
        price and how many pcs are available — a size auto-marks sold out when it hits 0. Leave pcs
        blank for unlimited, or leave everything empty if this item has a single price.
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-plum-ink/40">
          <span className="flex-1">Size</span>
          <span className="w-[104px]">Price</span>
          <span className="w-20">Pcs left</span>
          <span className="w-6" />
        </div>
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              name="variantName"
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="e.g. Small, 1/2 kilo, Large"
              className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
            <div className="flex w-[104px] items-center rounded-lg border border-plum-ink/15 px-2">
              <span className="text-sm text-plum-ink/40">₱</span>
              <input
                name="variantPrice"
                value={row.price}
                onChange={(e) => update(i, { price: e.target.value })}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full px-1 py-2 text-sm outline-none"
              />
            </div>
            <input
              name="variantStock"
              value={row.stock}
              onChange={(e) => update(i, { stock: e.target.value })}
              type="number"
              step="1"
              min="0"
              placeholder="∞"
              className="w-20 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="w-6 rounded-lg py-2 text-sm text-muted hover:text-guava"
              aria-label="Remove size"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={addRow} className="text-sm font-semibold text-brand-primary">
          + Add size
        </button>
        <SubmitButton>Save sizes</SubmitButton>
      </div>
    </form>
  );
}
