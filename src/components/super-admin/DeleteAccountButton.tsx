"use client";

import { useActionState, useRef } from "react";
import { deleteDormantAccount, type DeleteAccountState } from "@/server/billing/delete-account";

/**
 * Permanently delete a dormant account. Asks for the slug to be typed back —
 * the server checks it again, and checks the account really is dormant.
 */
export function DeleteAccountButton({
  restaurantId,
  name,
  slug,
  activity,
}: {
  restaurantId: string;
  name: string;
  slug: string;
  /** "no orders ever" / "last order 94 days ago" */
  activity: string;
}) {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteDormantAccount, null);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  if (state?.ok) return <p className="text-xs font-semibold text-plum-ink/60">✓ {state.message}</p>;

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input ref={confirmRef} type="hidden" name="confirm" value="" />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const typed = window.prompt(
            `PERMANENTLY delete "${name}" (${activity})?\n\n` +
              "Its menu, orders, sales history, staff logins and settings are all deleted. This cannot be undone.\n\n" +
              `Type ${slug} to confirm:`,
          );
          if (typed == null) return;
          if (confirmRef.current) confirmRef.current.value = typed;
          formRef.current?.requestSubmit();
        }}
        className="rounded border border-guava/50 px-2 py-1 text-xs font-semibold text-guava hover:bg-guava/10 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "🗑 Delete account"}
      </button>
      {state?.error && <p className="mt-1 max-w-xs text-[11px] text-guava">{state.error}</p>}
    </form>
  );
}
