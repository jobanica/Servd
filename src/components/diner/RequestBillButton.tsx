"use client";

import { useState } from "react";
import { requestBill } from "@/server/orders/request-bill";

export function RequestBillButton({
  slug,
  tableToken,
}: {
  slug: string;
  tableToken: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function handle() {
    setState("busy");
    setMsg(null);
    const res = await requestBill({ slug, tableToken });
    if (res.ok) {
      setState("done");
    } else {
      setState("idle");
      setMsg(res.error ?? "Couldn't request the bill.");
    }
  }

  if (state === "done") {
    return (
      <span className="text-sm font-semibold text-brand-primary">
        ✓ Bill requested — a server is on the way
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handle}
        disabled={state === "busy"}
        className="rounded-full border border-brand-ink/15 px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
      >
        {state === "busy" ? "Requesting…" : "Request bill"}
      </button>
      {msg && <span className="text-xs text-guava">{msg}</span>}
    </span>
  );
}
