"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createBundle, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

/**
 * Builds a "pick N for a fixed price" bundle (e.g. a bilao: 3 dishes for ₱3,499).
 * The owner sets the price + how many the customer picks, then lists the dish
 * choices. On the storefront the customer must choose exactly N.
 */
export function AddBundleForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createBundle, null);
  const [open, setOpen] = useState(false);
  const [dishes, setDishes] = useState<string[]>(["", "", ""]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setDishes(["", "", ""]);
      setOpen(false);
    }
  }, [state]);

  if (categories.length === 0) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
        🍱 Add a bundle (pick N for a fixed price)
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4">
      <div>
        <h3 className="font-heading text-base font-bold">New bundle</h3>
        <p className="text-xs text-plum-ink/50">
          e.g. a bilao — “3 dishes for ₱3,499”. Set the price and how many the customer picks, then list the choices.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-plum-ink/60">Category</span>
          <select name="categoryId" required className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-plum-ink/60">Bundle name</span>
          <input name="name" placeholder="e.g. Bilao Bundle — 3 dishes" required className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-plum-ink/60">Bundle price (₱)</span>
          <input name="pricePesos" type="number" step="0.01" min="0" placeholder="3499" required className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-plum-ink/60">Customer picks how many?</span>
          <input name="chooseCount" type="number" min="1" max="20" defaultValue={3} required className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        </label>
      </div>

      <textarea name="description" placeholder="Description (optional) — e.g. Good for family & groups" rows={2} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />

      <div>
        <p className="mb-1 text-sm font-semibold text-plum-ink/60">Dish choices</p>
        <div className="space-y-2">
          {dishes.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                name="dishName"
                value={d}
                onChange={(e) => setDishes((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                placeholder={`Dish ${i + 1} — e.g. Caldereta`}
                className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              />
              {dishes.length > 1 && (
                <button type="button" onClick={() => setDishes((p) => p.filter((_, idx) => idx !== i))} className="text-sm text-muted hover:text-guava">
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setDishes((p) => [...p, ""])} className="mt-2 rounded-full border border-plum-ink/15 px-4 py-1.5 text-sm font-semibold">
          + Add dish
        </button>
      </div>

      <label className="block text-sm">
        <span className="mr-2 text-plum-ink/60">Photo (optional)</span>
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="text-xs" />
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Creating…">Create bundle</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
