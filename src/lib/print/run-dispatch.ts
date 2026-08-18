"use client";

import type { PrintDispatch } from "@/server/printing/print";
import {
  isPrinterPaired,
  printBytes,
  base64ToBytes,
  type PrinterStation,
} from "@/lib/printing/bt-printer";
import { printViaBluetooth } from "@/lib/printing/bluetooth";

/**
 * Send a bare drawer pulse to the paired Bluetooth printer.
 *
 * Only Bluetooth needs this: for network and cloud the server already sent the
 * pulse, and the OS print dialog has no way to send one at all. The drawer is
 * wired to the printer, so whoever holds the printer connection opens it.
 */
export async function sendDrawerKick(base64: string): Promise<void> {
  const bytes = base64ToBytes(base64);
  if (isPrinterPaired()) {
    await printBytes(bytes);
    return;
  }
  await printViaBluetooth(bytes);
}

/** Open the printable ticket page (it auto-prints, then auto-closes). */
export function openTicketForPrint(orderId: string, doc: "bill" | "receipt" | "kitchen") {
  window.open(`/cashier/ticket/${orderId}?doc=${doc}`, "_blank", "noopener");
}

/**
 * Finish a print dispatch on the client — identical for the bill and the
 * receipt, so both print the same way. Priority:
 *   1. server already printed (network/cloud),
 *   2. a connected Web Bluetooth printer (prints silently),
 *   3. the configured Bluetooth method (one-shot pairing),
 *   4. the OS print dialog via the ticket page.
 */
export async function runPrintDispatch(
  res: PrintDispatch,
  orderId: string,
  doc: "bill" | "receipt" | "kitchen",
): Promise<string | null> {
  // A docket goes to the kitchen's own printer when one has been paired on this
  // device; otherwise it falls back to the till's, which is where it used to
  // come out anyway. No configuration needed on the client — a paired kitchen
  // printer IS the setting.
  const station: PrinterStation =
    doc === "kitchen" && isPrinterPaired("kitchen") ? "kitchen" : "till";
  return finishDispatch(res, () => openTicketForPrint(orderId, doc), station);
}

/**
 * The same finish for a document that isn't an order — the end-of-shift report.
 * Only the OS-dialog fallback differs, because there's no ticket page to open;
 * every other transport is byte-identical to a receipt, which is the point.
 */
export async function runReportDispatch(
  res: PrintDispatch,
  printUrl: string,
): Promise<string | null> {
  return finishDispatch(res, () => {
    window.open(printUrl, "_blank", "noopener");
  });
}

async function finishDispatch(
  res: PrintDispatch,
  fallback: () => void,
  station: PrinterStation = "till",
): Promise<string | null> {
  if (res.handledOnServer) return res.message || null;
  if (!res.ok && res.message) return res.message;

  // A paired Web Bluetooth printer prints the exact bytes we got back.
  // printBytes silently reconnects if the BLE link dropped while idle, so we
  // never re-open the device chooser once a printer has been paired.
  if (isPrinterPaired(station) && res.ticketBase64) {
    await printBytes(base64ToBytes(res.ticketBase64), station);
    return "Printed.";
  }
  if (res.clientAction === "bluetooth" && res.ticketBase64) {
    await printViaBluetooth(base64ToBytes(res.ticketBase64));
    return "Printed.";
  }
  // OS dialog / AirPrint fallback.
  fallback();
  return null;
}
