"use client";

import { useActionState, useEffect, useState } from "react";
import { updateModifier, deleteModifier, type FormState } from "@/server/menu/actions";
import { formatDelta, centavosToPesos } from "@/lib/money";
import { SubmitButton } from "./SubmitButton";

/**
 * One modifier option row with an inline edit toggle. View mode shows the name +
 * price delta with Edit / Remove; edit mode swaps in a small form to rename it
 * and change its price, saved via the updateModifier action.
 */
export function ModifierRow({
  id,
  name,
  priceDelta,
}: {
  id: string;
  name: string;
  priceDelta: number; // centavos
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(updateModifier, null);

  // Close the editor once the save succeeds.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <li className="rounded-lg bg-cream/60 px-3 py-1.5">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input
            name="name"
            defaultValue={name}
            placeholder="Option name"
            required
            className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-sm"
          />
          <input
            name="priceDeltaPesos"
            type="number"
            step="0.01"
            defaultValue={centavosToPesos(priceDelta)}
            placeholder="± ₱"
            className="w-24 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-sm"
          />
          <SubmitButton pendingLabel="…" className="px-3 py-1.5">
            Save
          </SubmitButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-muted hover:text-plum-ink"
          >
            Cancel
          </button>
          {state?.error && <p className="w-full text-xs text-guava">{state.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-lg bg-cream/60 px-3 py-1.5 text-sm">
      <span>
        {name} <span className="text-brand-primary">{formatDelta(priceDelta)}</span>
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-plum-ink/60 hover:text-brand-primary"
        >
          Edit
        </button>
        <form action={deleteModifier}>
          <input type="hidden" name="id" value={id} />
          <button className="text-xs text-muted hover:text-guava">Remove</button>
        </form>
      </div>
    </li>
  );
}
