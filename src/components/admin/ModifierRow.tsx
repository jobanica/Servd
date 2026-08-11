"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateModifier,
  deleteModifier,
  setModifierAvailability,
  type FormState,
} from "@/server/menu/actions";
import { formatDelta, centavosToPesos } from "@/lib/money";
import { SubmitButton } from "./SubmitButton";

/**
 * One modifier option row with an inline edit toggle. View mode shows the name +
 * price delta with Mark out / Edit / Remove; edit mode swaps in a small form to
 * rename it and change its price, saved via the updateModifier action.
 *
 * "Mark out" is the 86 button: the add-on stays in the group but shows as sold
 * out to diners, so a temporary shortage doesn't mean deleting and re-adding it.
 */
export function ModifierRow({
  id,
  name,
  priceDelta,
  isAvailable = true,
}: {
  id: string;
  name: string;
  priceDelta: number; // centavos
  isAvailable?: boolean;
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
      <span className={isAvailable ? "" : "text-plum-ink/40"}>
        <span className={isAvailable ? "" : "line-through"}>{name}</span>{" "}
        <span className={isAvailable ? "text-brand-primary" : ""}>{formatDelta(priceDelta)}</span>
        {!isAvailable && (
          <span className="ml-2 rounded-full bg-guava/10 px-2 py-0.5 text-xs font-semibold text-guava">
            Marked out
          </span>
        )}
      </span>
      <div className="flex items-center gap-3">
        <form action={setModifierAvailability}>
          <input type="hidden" name="id" value={id} />
          {/* Checked = put it back on the menu; unchecked = mark it out. */}
          {!isAvailable && <input type="hidden" name="isAvailable" value="on" />}
          <button
            className={`text-xs font-semibold ${
              isAvailable ? "text-plum-ink/60 hover:text-guava" : "text-green-700"
            }`}
          >
            {isAvailable ? "Mark out" : "Available again"}
          </button>
        </form>
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
