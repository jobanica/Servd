"use client";

import { useState, useTransition } from "react";
import { openAgreement } from "@/server/agent-portal/owner-actions";

/** Opens the portal-hosted agreement. A not-ready portal says so, kindly. */
export function SignAgreementButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await openAgreement();
            if (r?.error) setError(r.error);
          })
        }
        className="rounded-lg px-4 py-2.5 font-semibold btn-brand disabled:opacity-60"
      >
        {pending ? "Opening…" : "Review & sign the agreement"}
      </button>
      {error && <p className="mt-2 text-sm text-guava">{error}</p>}
    </div>
  );
}
