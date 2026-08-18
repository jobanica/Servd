import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { parsePrinterConfig, kitchenDestination } from "@/lib/printing/printer-config";

/**
 * Does the cashier's device need to pair a SECOND Bluetooth printer?
 *
 * True only for a Bluetooth kitchen printer. A network or cloud one is driven
 * by the server and needs nothing at the till, so showing a pairing button for
 * it would just be a button that does nothing useful.
 */
export async function kitchenNeedsBluetoothPairing(restaurantId: string): Promise<boolean> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { printerConfig: true } }),
    );
    const dest = kitchenDestination(parsePrinterConfig(r?.printerConfig).kitchen);
    return dest?.method === "bluetooth";
  } catch {
    return false;
  }
}
