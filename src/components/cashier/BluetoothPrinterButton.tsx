"use client";

import { useEffect, useState } from "react";
import {
  connectPrinter,
  disconnectPrinter,
  isBluetoothSupported,
  isPrinterConnected,
  onPrinterChange,
  printerName,
} from "@/lib/printing/bt-printer";

/**
 * Pair a Bluetooth receipt printer once; afterwards receipts print
 * automatically on each payment. Shows live connection status.
 */
export function BluetoothPrinterButton() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const supported = isBluetoothSupported();

  useEffect(() => {
    setConnected(isPrinterConnected());
    return onPrinterChange(setConnected);
  }, []);

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      await connectPrinter();
    } catch (e) {
      // User cancelling the chooser throws — only surface real errors.
      const msg = e instanceof Error ? e.message : "Couldn't connect.";
      if (!/cancel|user/i.test(msg)) setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null; // hidden on iOS/Safari (no Web Bluetooth)

  if (connected) {
    return (
      <button
        onClick={disconnectPrinter}
        title={printerName() ?? "Printer connected"}
        className="rounded-full border border-mango/50 bg-mango/10 px-4 py-2 text-sm font-semibold text-mango"
      >
        🖨️ Printer connected
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={connect}
        disabled={busy}
        className="rounded-full border border-plum-ink/15 bg-white px-4 py-2 text-sm font-semibold text-plum-ink hover:bg-cream disabled:opacity-60"
      >
        {busy ? "Connecting…" : "🖨️ Connect printer"}
      </button>
      {err && <span className="text-xs text-guava">{err}</span>}
    </span>
  );
}
