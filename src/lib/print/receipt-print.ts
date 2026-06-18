"use client";

/**
 * Print a receipt without taking over the screen: load the printable ticket
 * page into a hidden, off-screen iframe and let its <AutoPrint/> fire the print
 * dialog (or print silently when the browser runs in kiosk-printing mode).
 *
 * This avoids the previous behaviour of opening the receipt in a visible tab —
 * the cashier stays on the board and only the print dialog appears.
 */
export function printReceiptInBackground(orderId: string) {
  if (typeof document === "undefined") return;

  // Remove any previous print frame so rapid payments don't pile up.
  document.getElementById("receipt-print-frame")?.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "receipt-print-frame";
  // Off-screen but fully rendered (0×0 / display:none won't print).
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:380px;height:600px;border:0;";
  iframe.src = `/cashier/ticket/${orderId}`;
  document.body.appendChild(iframe);

  // Clean up well after the dialog would have closed.
  window.setTimeout(() => iframe.remove(), 120000);
}
