"use client";

import { useState } from "react";
import { printOrderTicket } from "@/server/printing/print";
import { runPrintDispatch } from "@/lib/print/run-dispatch";

/**
 * Prints the BILL (amount due, pre-payment). Uses the shared dispatch runner so
 * it prints exactly the same way as the paid receipt.
 */
export function PrintTicketButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handlePrint() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await printOrderTicket(orderId);
      if (!res.ok && res.message) {
        setMsg(res.message);
        return;
      }
      const m = await runPrintDispatch(res, orderId, "bill");
      if (m) setMsg(m);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Print failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handlePrint}
        disabled={busy}
        className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
      >
        {busy ? "Printing…" : "Print bill"}
      </button>
      {msg && <span className="text-xs text-plum-ink/50">{msg}</span>}
    </span>
  );
}
