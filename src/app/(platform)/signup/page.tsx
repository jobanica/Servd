"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpRestaurant, type SignupState } from "./actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState<SignupState, FormData>(
    signUpRestaurant,
    null,
  );

  if (state?.ok) {
    return (
      <div className="mx-auto max-w-sm pt-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
          ✓
        </div>
        <h1 className="mt-4 font-heading text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-sm text-plum-ink/60">
          We sent a confirmation link. Click it, then sign in to finish setting
          up your restaurant.
        </p>
        <Link href="/login" className="mt-6 inline-block font-semibold text-brand-primary">
          Go to login →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm pt-10">
      <h1 className="font-heading text-2xl font-bold">Start your restaurant</h1>
      <p className="mt-1 text-sm text-plum-ink/60">
        Create your account — it takes a minute.
      </p>

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="restaurantName">
            Restaurant name
          </label>
          <input
            id="restaurantName"
            name="restaurantName"
            required
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="email">
            Your email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>

        {state?.error && <p className="text-sm text-guava">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create my restaurant"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-plum-ink/50">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-primary">
          Sign in
        </Link>
      </p>
    </div>
  );
}
