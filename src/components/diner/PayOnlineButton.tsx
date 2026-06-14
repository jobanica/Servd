"use client";

import { useState } from "react";
import { createTableCheckout } from "@/server/payments/checkout";

export function PayOnlineButton({
  slug,
  tableToken,
}: {
  slug: string;
  tableToken: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setError(null);
    const res = await createTableCheckout({ slug, tableToken });
    if (res.ok && res.checkoutUrl) {
      // Hand off to the gateway's hosted checkout (GCash / card).
      window.location.href = res.checkoutUrl;
    } else {
      setBusy(false);
      setError(res.error ?? "Couldn't start payment.");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handle}
        disabled={busy}
        className="rounded-full px-4 py-1.5 text-sm font-semibold btn-brand disabled:opacity-60"
      >
        {busy ? "Starting…" : "Pay online"}
      </button>
      {error && <span className="text-xs text-guava">{error}</span>}
    </span>
  );
}
