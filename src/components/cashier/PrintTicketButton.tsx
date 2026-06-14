"use client";

import { useState } from "react";
import { printOrderTicket } from "@/server/printing/print";
import { printViaBluetooth, isBluetoothSupported } from "@/lib/printing/bluetooth";

/** Decodes a base64 ESC/POS payload into bytes (browser-safe). */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Method-aware print button. The server decides the transport; for the two
 * client-side transports it returns the ticket data and we finish here.
 */
export function PrintTicketButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handlePrint() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await printOrderTicket(orderId);

      if (res.handledOnServer) {
        setMsg(res.message);
      } else if (res.clientAction === "bluetooth" && res.ticketBase64) {
        if (!isBluetoothSupported()) {
          setMsg("Bluetooth unsupported here — switch to Cloud or OS print.");
        } else {
          await printViaBluetooth(base64ToBytes(res.ticketBase64));
          setMsg("Printed via Bluetooth.");
        }
      } else if (res.clientAction === "os_dialog") {
        // Open the printable HTML ticket; it triggers the OS print dialog.
        window.open(`/cashier/ticket/${orderId}`, "_blank", "noopener");
      } else {
        setMsg(res.message || "Couldn't print.");
      }
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
        {busy ? "Printing…" : "Print ticket"}
      </button>
      {msg && <span className="text-xs text-plum-ink/50">{msg}</span>}
    </span>
  );
}
