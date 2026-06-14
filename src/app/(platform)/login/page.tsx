"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);
  const t = useTranslations("auth");

  return (
    <div className="mx-auto max-w-sm pt-10">
      <h1 className="font-heading text-2xl font-bold">{t("loginTitle")}</h1>
      <p className="mt-1 text-sm text-plum-ink/60">{t("loginSubtitle")}</p>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="email">
            {t("email")}
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
            {t("password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-guava">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60"
        >
          {pending ? t("signingIn") : t("signIn")}
        </button>
      </form>
    </div>
  );
}
