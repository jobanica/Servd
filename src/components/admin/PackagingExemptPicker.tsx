"use client";

import { useMemo, useState } from "react";

export interface PackagingMenuItem {
  id: string;
  name: string;
  noPackaging: boolean;
}
export interface PackagingMenuCategory {
  id: string;
  name: string;
  items: PackagingMenuItem[];
}

/**
 * Which menu items the packaging fee skips.
 *
 * Lives inside the storefront form, so it submits with everything else and the
 * owner presses Save once. Ticking a box here means "this needs no container":
 * a bottled softdrink, a canned beer, packed chips. Everything left unticked
 * is packed and charged, which is how the fee behaved before this existed.
 *
 * Whole-category toggles are the point of the layout, not a nicety — drinks
 * are a category, and a menu with thirty of them is the case that made this
 * necessary in the first place.
 */
export function PackagingExemptPicker({
  categories,
  perItem,
}: {
  categories: PackagingMenuCategory[];
  /** Fee mode, purely for the wording of the hint. */
  perItem: boolean;
}) {
  const [exempt, setExempt] = useState<Set<string>>(
    () => new Set(categories.flatMap((c) => c.items.filter((i) => i.noPackaging).map((i) => i.id))),
  );

  const total = useMemo(
    () => categories.reduce((n, c) => n + c.items.length, 0),
    [categories],
  );

  function toggle(id: string) {
    setExempt((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setCategory(cat: PackagingMenuCategory, on: boolean) {
    setExempt((prev) => {
      const next = new Set(prev);
      for (const i of cat.items) {
        if (on) next.add(i.id);
        else next.delete(i.id);
      }
      return next;
    });
  }

  if (total === 0) {
    return (
      <p className="text-xs text-plum-ink/50">
        Add menu items first, then come back to pick the ones that need no packaging.
      </p>
    );
  }

  return (
    <div>
      {/* The marker tells the server this form offered the picker at all, so a
          save from anywhere else can never clear every exemption. */}
      <input type="hidden" name="packagingExemptField" value="1" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-plum-ink/60">
          Skip the fee on these items
        </span>
        <span className="text-xs text-plum-ink/45">
          {exempt.size} of {total} skipped
        </span>
      </div>
      <p className="mt-0.5 text-xs text-plum-ink/50">
        Tick anything that comes in its own container — bottled and canned drinks,
        packed chips.{" "}
        {perItem
          ? "They stop counting towards the per-item fee."
          : "An order made only of these is charged no packaging fee at all."}
      </p>

      <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-plum-ink/10 bg-white p-3">
        {categories.map((c) => {
          const all = c.items.length > 0 && c.items.every((i) => exempt.has(i.id));
          return (
            <div key={c.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-plum-ink/50">
                  {c.name}
                </span>
                {c.items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCategory(c, !all)}
                    className="rounded-full border border-plum-ink/15 px-2 py-0.5 text-[11px] font-semibold text-plum-ink/60 hover:bg-cream"
                  >
                    {all ? "Charge all" : "Skip all"}
                  </button>
                )}
              </div>
              <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {c.items.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="packagingExemptItemId"
                      value={i.id}
                      checked={exempt.has(i.id)}
                      onChange={() => toggle(i.id)}
                    />
                    <span className="truncate">{i.name}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
