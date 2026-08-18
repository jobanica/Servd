"use client";

import { useEffect, useState } from "react";
import {
  connectPrinter,
  disconnectPrinter,
  isBluetoothSupported,
  isPrinterPaired,
  onPrinterChange,
  printerName,
  type PrinterStation,
} from "@/lib/printing/bt-printer";

const LABEL: Record<PrinterStation, { idle: string; live: string }> = {
  till: { idle: "🖨️ Connect printer", live: "🖨️ Printer connected" },
  kitchen: { idle: "🍳 Connect kitchen printer", live: "🍳 Kitchen printer connected" },
};

/**
 * Pair a Bluetooth printer once; afterwards it prints automatically. Shows live
 * connection status.
 *
 * Rendered twice where a restaurant runs a docket printer at the pass as well —
 * one button per station, each pairing its own device.
 */
export function BluetoothPrinterButton({ station = "till" }: { station?: PrinterStation }) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const supported = isBluetoothSupported();

  useEffect(() => {
    setConnected(isPrinterPaired(station));
    // Ignore the other station's events, or pairing the kitchen printer would
    // light up the till's button too.
    return onPrinterChange((live, which) => {
      if (which === station) setConnected(live);
    });
  }, [station]);

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      await connectPrinter({ station });
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
        onClick={() => disconnectPrinter(station)}
        title={printerName(station) ?? "Printer connected"}
        className="w-full rounded-full border border-mango/50 bg-mango/10 px-4 py-2.5 text-sm font-semibold text-mango"
      >
        {LABEL[station].live}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={connect}
        disabled={busy}
        className="w-full rounded-full border border-plum-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-plum-ink hover:bg-cream disabled:opacity-60"
      >
        {busy ? "Connecting…" : LABEL[station].idle}
      </button>
      {err && <span className="text-xs text-guava">{err}</span>}
    </>
  );
}
