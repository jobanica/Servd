"use client";

import { useActionState, useEffect, useRef } from "react";
import { createRestaurantAccount, type ActionState } from "@/server/billing/super-admin-actions";

export function CreateAccountForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createRestaurantAccount, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset(); // ready for the next account
  }, [state]);

  const field = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-plum-ink/45";

  return (
    <form ref={formRef} action={action} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Restaurant name</label>
          <input name="restaurantName" required className={field} />
        </div>
        <div>
          <label className={label}>Phone (optional)</label>
          <input name="phone" className={field} />
        </div>
        <div>
          <label className={label}>Login email</label>
          <input name="email" type="email" required autoComplete="off" className={field} />
        </div>
        <div>
          <label className={label}>Password</label>
          <input name="password" type="text" minLength={8} required autoComplete="off" placeholder="min 8 chars" className={field} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-full px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60">
          {pending ? "Creating…" : "Create account"}
        </button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mango">{state.message}</p>}
      </div>
      <p className="text-xs text-plum-ink/45">
        The email is confirmed automatically — the owner can sign in immediately, no confirmation
        link. Share the email + password with them.
      </p>
    </form>
  );
}
