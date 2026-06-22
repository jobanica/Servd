"use client";

import { useState } from "react";

/** Copies a setup/claim link to the clipboard. */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-full border border-brand-primary/30 bg-brand-primary/5 px-3 py-1 text-xs font-semibold text-brand-primary"
      title={url}
    >
      {copied ? "Copied ✓" : "Copy setup link"}
    </button>
  );
}
