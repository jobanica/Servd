"use client";

import { useState } from "react";
import { saveItemVariants } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

type Row = { name: string; price: string };

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
  initial: { name: string; price: number }[];
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.length > 0
      ? initial.map((v) => ({ name: v.name, price: (v.price / 100).toFixed(2) }))
      : [{ name: "", price: "" }],
  );

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { name: "", price: "" }]);
  }
  function removeRow(i: number) {
    setRows((r) => (r.length <= 1 ? [{ name: "", price: "" }] : r.filter((_, j) => j !== i)));
  }

  return (
    <form action={saveItemVariants} className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <input type="hidden" name="id" value={itemId} />
      <h2 className="font-heading text-lg font-bold">Sizes &amp; prices</h2>
      <p className="mt-0.5 text-sm text-plum-ink/55">
        For items sold in more than one size or weight (e.g. fish, pork). Add each size with its own
        price — customers pick one when ordering. Leave empty if this item has a single price.
      </p>

      <div className="mt-3 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              name="variantName"
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Size — e.g. Small, 1/2 kilo, Large"
              className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
            <div className="flex items-center rounded-lg border border-plum-ink/15 px-2">
              <span className="text-sm text-plum-ink/40">₱</span>
              <input
                name="variantPrice"
                value={row.price}
                onChange={(e) => update(i, { price: e.target.value })}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-24 px-1 py-2 text-sm outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="rounded-lg px-2 py-2 text-sm text-muted hover:text-guava"
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
