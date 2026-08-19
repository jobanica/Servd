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
export function BluetoothPrinterButton({
  station = "till",
  explainUnsupported = false,
}: {
  station?: PrinterStation;
  /**
   * Say why the button is missing instead of rendering nothing.
   *
   * Used for the kitchen printer: the settings page has just told them to come
   * here and pair it, so silence looks like a bug in the app rather than a
   * limitation of the browser they're using.
   */
  explainUnsupported?: boolean;
}) {
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

  if (!supported) {
    // No Web Bluetooth: iOS/Safari at all, and Chrome on iOS too (it's Safari
    // underneath). Nothing here can pair a printer on this device.
    if (!explainUnsupported) return null;
    return (
      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
        This device can&apos;t pair a Bluetooth printer — Web Bluetooth needs Chrome on Android or
        a desktop, and never works on iPhone or iPad. Use this till on an Android tablet, or set
        the kitchen printer to <strong>Network</strong> in Printer settings so the server drives
        it instead.
      </p>
    );
  }

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
