"use client";

import { useActionState, useEffect, useState } from "react";
import { updateModifierGroup, deleteModifierGroup, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

/**
 * A modifier group's header with an inline edit toggle — rename it and change
 * required / min–max selection, or delete it. View mode shows the name + rule
 * summary with Edit / Delete group.
 */
export function ModifierGroupHeader({
  group,
}: {
  group: { id: string; name: string; required: boolean; minSelect: number; maxSelect: number };
}) {
  const [editing, setEditing] = useState(false);
  const [required, setRequired] = useState(group.required);
  const [state, action] = useActionState<FormState, FormData>(updateModifierGroup, null);

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <form action={action} className="space-y-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
        <input type="hidden" name="id" value={group.id} />
        <input
          name="name"
          defaultValue={group.name}
          required
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="required"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Required
          </label>
          {/* Min only means anything for a required group — an optional one can
              always be skipped, so we hide it rather than let a stale minimum
              keep forcing a choice. */}
          {required ? (
            <label className="flex items-center gap-2">
              Min
              <input name="minSelect" type="number" min="1" defaultValue={Math.max(1, group.minSelect)} className="w-16 rounded-lg border border-plum-ink/15 px-2 py-1" />
            </label>
          ) : (
            <span className="text-xs text-plum-ink/45">Diners can skip this group.</span>
          )}
          <label className="flex items-center gap-2">
            Max
            <input name="maxSelect" type="number" min="1" defaultValue={group.maxSelect} className="w-16 rounded-lg border border-plum-ink/15 px-2 py-1" />
          </label>
        </div>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          <button
            type="button"
            onClick={() => {
              setRequired(group.required);
              setEditing(false);
            }}
            className="text-xs font-semibold text-muted hover:text-plum-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="font-heading text-lg font-bold">{group.name}</h2>
        <p className="text-xs text-plum-ink/50">
          {group.required ? "Required" : "Optional"} · select {group.minSelect}–{group.maxSelect}{" "}
          {group.maxSelect === 1 ? "(single)" : "(multi)"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setRequired(group.required);
            setEditing(true);
          }}
          className="text-xs font-semibold text-plum-ink/60 hover:text-brand-primary"
        >
          Edit
        </button>
        <form action={deleteModifierGroup}>
          <input type="hidden" name="id" value={group.id} />
          <button className="text-xs text-muted hover:text-guava">Delete group</button>
        </form>
      </div>
    </div>
  );
}
