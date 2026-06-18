"use client";

import type { PrintDispatch } from "@/server/printing/print";
import { isPrinterConnected, printBytes, base64ToBytes } from "@/lib/printing/bt-printer";
import { printViaBluetooth } from "@/lib/printing/bluetooth";

/** Open the printable ticket page (it auto-prints, then auto-closes). */
export function openTicketForPrint(orderId: string, doc: "bill" | "receipt") {
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
  doc: "bill" | "receipt",
): Promise<string | null> {
  if (res.handledOnServer) return res.message || null;

  // A connected Web Bluetooth printer prints the exact bytes we got back.
  if (isPrinterConnected() && res.ticketBase64) {
    await printBytes(base64ToBytes(res.ticketBase64));
    return "Printed.";
  }
  if (res.clientAction === "bluetooth" && res.ticketBase64) {
    await printViaBluetooth(base64ToBytes(res.ticketBase64));
    return "Printed.";
  }
  // OS dialog / AirPrint fallback.
  openTicketForPrint(orderId, doc);
  return null;
}
