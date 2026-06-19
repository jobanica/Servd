"use client";

import { useState } from "react";

/** Shows the referral link with a one-tap copy button. */
export function ReferralLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg bg-cream px-3 py-2 text-sm">{url}</code>
      <button
        onClick={copy}
        className="rounded-full px-4 py-2 text-sm font-semibold btn-brand"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
