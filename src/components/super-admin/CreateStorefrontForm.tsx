"use client";

import { useActionState } from "react";
import { createDemoStorefront, type FormState } from "@/server/storefront-demo/actions";

export function CreateStorefrontForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createDemoStorefront, null);
  const field = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="grid gap-3 rounded-tile border border-plum-ink/10 bg-white p-4 sm:grid-cols-2">
      <input name="name" required placeholder="Business name *" className={field} />
      <input name="phone" placeholder="Phone (optional)" className={field} />
      <input name="address" placeholder="Address (optional)" className={`sm:col-span-2 ${field}`} />
      <input name="tagline" placeholder="Tagline (optional) — e.g. Davao's best BBQ" className={field} />
      <input name="logoUrl" placeholder="Logo image URL (optional)" className={field} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          disabled={pending}
          className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create storefront"}
        </button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
      </div>
    </form>
  );
}
