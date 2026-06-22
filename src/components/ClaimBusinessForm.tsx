"use client";

import Link from "next/link";
import { useActionState } from "react";
import { claimBusiness, type ClaimState } from "@/server/restaurants/claim";

export function ClaimBusinessForm({ token, businessName }: { token: string; businessName: string }) {
  const [state, action, pending] = useActionState<ClaimState, FormData>(claimBusiness, null);

  if (state?.ok) {
    return (
      <div className="rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
        <p className="text-3xl">🎉</p>
        <h1 className="mt-2 font-heading text-xl font-bold">You're all set</h1>
        <p className="mt-1 text-sm text-plum-ink/60">
          Your login for <strong>{businessName}</strong> is ready. Sign in with the email and
          password you just chose.
        </p>
        <Link href="/login" className="mt-5 inline-block rounded-full px-6 py-2.5 text-sm font-semibold btn-brand">
          Go to sign in
        </Link>
      </div>
    );
  }

  const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <form action={action} className="rounded-tile border border-plum-ink/10 bg-white p-6">
      <h1 className="font-heading text-xl font-bold">Set up {businessName}</h1>
      <p className="mt-1 text-sm text-plum-ink/55">
        Add your email and a password to create your dashboard login.
      </p>
      <input type="hidden" name="token" value={token} />
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="font-medium">Your email</span>
          <input name="email" type="email" required autoComplete="email" className={field} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Password</span>
          <input name="password" type="password" minLength={8} required autoComplete="new-password" placeholder="min 8 characters" className={field} />
        </label>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      <button disabled={pending} className="mt-5 w-full rounded-full py-3 text-sm font-semibold text-white btn-brand disabled:opacity-60">
        {pending ? "Setting up…" : "Create my login"}
      </button>
    </form>
  );
}
