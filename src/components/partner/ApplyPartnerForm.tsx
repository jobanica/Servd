"use client";

import { useActionState } from "react";
import Link from "next/link";
import { applyAsPartner, type ApplyState } from "@/server/partners/apply";

export function ApplyPartnerForm() {
  const [state, action] = useActionState<ApplyState, FormData>(applyAsPartner, null);
  const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-wide text-plum-ink/50";

  if (state?.ok) {
    return (
      <div className="rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
        <p className="text-3xl">✅</p>
        <h2 className="mt-2 font-heading text-xl font-bold">Application received</h2>
        <p className="mt-1 text-sm text-plum-ink/60">
          Confirm your email, then we&apos;ll review your application. You&apos;ll get your
          referral link once approved.
        </p>
        <Link href="/partner/login" className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold btn-brand">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-6">
      <div>
        <label className={label}>Your name</label>
        <input name="name" required className={field} placeholder="Juan Dela Cruz" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Email</label>
          <input name="email" type="email" required className={field} />
        </div>
        <div>
          <label className={label}>Password</label>
          <input name="password" type="password" required className={field} placeholder="At least 8 characters" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Partner type</label>
          <select name="tier" className={field}>
            <option value="affiliate">Affiliate (referrals)</option>
            <option value="reseller">Reseller (setup &amp; support)</option>
          </select>
        </div>
        <div>
          <label className={label}>Payout method</label>
          <select name="payoutMethod" className={field}>
            <option value="gcash">GCash</option>
            <option value="bank">Bank transfer</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Payout details (account name &amp; number)</label>
        <input name="payoutDetails" required className={field} placeholder="e.g. GCash · Juan DC · 0917…" />
      </div>
      <div>
        <label className={label}>Tax ID / TIN (optional)</label>
        <input name="taxInfo" className={field} />
        <p className="mt-1 text-xs text-plum-ink/45">
          Stored securely to support tax reporting. Consult your accountant on withholding.
        </p>
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <button className="rounded-full px-6 py-2.5 text-sm font-semibold btn-brand">Apply to partner</button>
    </form>
  );
}
