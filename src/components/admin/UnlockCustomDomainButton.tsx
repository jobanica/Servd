"use client";

import { useState } from "react";
import { startCustomDomainUnlock } from "@/server/billing/addon-actions";

/** Sends the owner to the hosted checkout for the one-time custom-domain unlock. */
export function UnlockCustomDomainButton({ price }: { price: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const res = await startCustomDomainUnlock();
    if ("checkoutUrl" in res) {
      window.location.href = res.checkoutUrl;
      return; // leaving the page — keep the button disabled
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-full px-5 py-2.5 text-sm font-semibold btn-brand disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : `Unlock for ${price}`}
      </button>
      {error && <p className="mt-2 text-sm text-guava">{error}</p>}
    </div>
  );
}
