"use client";

/**
 * Persistent Web Bluetooth ESC/POS printer (Chromium desktop/Android only).
 *
 * Unlike the one-shot printViaBluetooth (which re-prompts every print), this
 * keeps the paired device so receipts print automatically after the first
 * "Connect printer" tap. Reconnects the GATT link on demand if it drops.
 */

const DEFAULT_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const DEFAULT_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let device: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let characteristic: any = null;
let serviceUuid = DEFAULT_SERVICE;
let charUuid = DEFAULT_CHAR;

const listeners = new Set<(connected: boolean) => void>();
function notify() {
  for (const l of listeners) l(isPrinterPaired());
}

export function onPrinterChange(cb: (connected: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Whether a printer has been paired this session. BLE printers drop the GATT
 * link when idle, so the live connection (isPrinterConnected) flickers between
 * prints — but the device stays paired and printBytes reconnects on demand.
 * Status and print routing key off pairing, not the momentary GATT state.
 */
export function isPrinterPaired(): boolean {
  return !!device;
}

export function isPrinterConnected(): boolean {
  return !!(device?.gatt?.connected && characteristic);
}

export function printerName(): string | null {
  return device?.name ?? null;
}

/** Pair + connect a printer. MUST be called from a user gesture (a click). */
export async function connectPrinter(opts?: { serviceUuid?: string; charUuid?: string }): Promise<void> {
  if (!isBluetoothSupported()) {
    throw new Error("Bluetooth isn't supported on this device/browser. Use Chrome on desktop or Android.");
  }
  serviceUuid = opts?.serviceUuid ?? DEFAULT_SERVICE;
  charUuid = opts?.charUuid ?? DEFAULT_CHAR;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bt = (navigator as any).bluetooth;
  device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: [serviceUuid] });
  device.addEventListener("gattserverdisconnected", () => {
    characteristic = null;
    notify();
  });
  await connectGatt();
  notify();
}

async function connectGatt(): Promise<void> {
  const server = await device.gatt.connect();
  const svc = await server.getPrimaryService(serviceUuid);
  characteristic = await svc.getCharacteristic(charUuid);
}

/** Send ESC/POS bytes to the connected printer (reconnects if dropped). */
export async function printBytes(bytes: Uint8Array): Promise<void> {
  if (!device) throw new Error("No printer connected.");
  if (!isPrinterConnected()) await connectGatt();
  const CHUNK = 200; // BLE writes are capped (~512 bytes)
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await characteristic.writeValueWithoutResponse(bytes.slice(i, i + CHUNK));
  }
}

export function disconnectPrinter(): void {
  try {
    device?.gatt?.disconnect();
  } catch {
    /* ignore */
  }
  // Fully unpair so the status reverts and the next print won't silently
  // reconnect to a printer the user deliberately disconnected.
  device = null;
  characteristic = null;
  notify();
}

/** Decode a base64 ESC/POS payload into bytes (browser-safe). */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
