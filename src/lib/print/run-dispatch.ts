"use client";

import type { PrintDispatch } from "@/server/printing/print";
import { isPrinterPaired, printBytes, base64ToBytes } from "@/lib/printing/bt-printer";
import { printViaBluetooth } from "@/lib/printing/bluetooth";

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
  return finishDispatch(res, () => openTicketForPrint(orderId, doc));
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
): Promise<string | null> {
  if (res.handledOnServer) return res.message || null;
  if (!res.ok && res.message) return res.message;

  // A paired Web Bluetooth printer prints the exact bytes we got back.
  // printBytes silently reconnects if the BLE link dropped while idle, so we
  // never re-open the device chooser once a printer has been paired.
  if (isPrinterPaired() && res.ticketBase64) {
    await printBytes(base64ToBytes(res.ticketBase64));
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
