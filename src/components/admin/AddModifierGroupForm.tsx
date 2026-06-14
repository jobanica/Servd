"use client";

import { useActionState, useEffect, useRef } from "react";
import { createModifierGroup, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

export function AddModifierGroupForm() {
  const [state, action] = useActionState<FormState, FormData>(
    createModifierGroup,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4"
    >
      <h3 className="font-heading font-bold">New modifier group</h3>
      <input
        name="name"
        placeholder="e.g. Size, Add-ons, Spice level"
        required
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="required" />
          Required
        </label>
        <label className="flex items-center gap-2">
          Min
          <input
            name="minSelect"
            type="number"
            min="0"
            defaultValue={0}
            className="w-16 rounded-lg border border-plum-ink/15 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2">
          Max
          <input
            name="maxSelect"
            type="number"
            min="1"
            defaultValue={1}
            className="w-16 rounded-lg border border-plum-ink/15 px-2 py-1"
          />
        </label>
        <span className="text-xs text-plum-ink/40">
          (Max 1 = single-select · Max &gt; 1 = multi-select)
        </span>
      </div>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <SubmitButton pendingLabel="Adding…">Add group</SubmitButton>
    </form>
  );
}
