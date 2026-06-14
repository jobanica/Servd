"use client";

import { useActionState, useEffect, useRef } from "react";
import { createModifier, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

/** Adds an option (e.g. "Large +30") to a modifier group. */
export function AddModifierForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    createModifier,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="modifierGroupId" value={groupId} />
      <input
        name="name"
        placeholder="Option name"
        required
        className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-sm"
      />
      <input
        name="priceDeltaPesos"
        type="number"
        step="0.01"
        placeholder="± ₱"
        defaultValue={0}
        className="w-24 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-sm"
      />
      <SubmitButton pendingLabel="…" className="px-3 py-1.5">
        Add
      </SubmitButton>
      {state?.error && <p className="text-xs text-guava">{state.error}</p>}
    </form>
  );
}
