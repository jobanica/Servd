"use client";

import { useActionState, useState } from "react";
import { updatePrintSettings, type FormState } from "@/server/printing/settings";
import { SubmitButton } from "./SubmitButton";

type Method = "network" | "cloud" | "bluetooth" | "os_dialog";

const METHOD_HELP: Record<Method, string> = {
  network:
    "Wi-Fi/USB ESC/POS printer at a fixed cashier station, via a small local print-bridge agent. Most reliable default.",
  cloud:
    "Printer polls Servd for jobs (Star CloudPRNT / Epson Server Direct Print). Works on ANY device, including iPad/iPhone.",
  bluetooth:
    "Web Bluetooth — Chromium on desktop/Android only (NOT Safari/iOS), BLE ESC/POS printers only.",
  os_dialog:
    "Print the HTML ticket via the OS print dialog / AirPrint. Device-agnostic fallback.",
};

export function PrintSettingsForm({
  initial,
  cloudPollUrl,
}: {
  initial: { printMethod: Method; autoPrint: boolean; bridgeUrl: string };
  cloudPollUrl: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updatePrintSettings,
    null,
  );
  const [method, setMethod] = useState<Method>(initial.printMethod);

  return (
    <form
      action={action}
      className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      <div>
        <label className="block text-sm font-semibold">Print method</label>
        <select
          name="printMethod"
          value={method}
          onChange={(e) => setMethod(e.target.value as Method)}
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        >
          <option value="network">Network / USB (ESC/POS)</option>
          <option value="cloud">Cloud poll (CloudPRNT / Server Direct)</option>
          <option value="bluetooth">Bluetooth (Web Bluetooth)</option>
          <option value="os_dialog">OS print dialog / AirPrint</option>
        </select>
        <p className="mt-2 text-sm text-plum-ink/60">{METHOD_HELP[method]}</p>
      </div>

      {method === "bluetooth" && (
        <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/70">
          On an iPhone/iPad? Bluetooth won&apos;t work — choose Cloud poll or OS
          print instead.
        </p>
      )}

      {method === "network" && (
        <div>
          <label className="block text-sm font-semibold">Print-bridge URL</label>
          <input
            name="bridgeUrl"
            defaultValue={initial.bridgeUrl}
            placeholder="http://192.168.1.50:8080/print"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
          <p className="mt-1 text-xs text-plum-ink/50">
            The local agent that relays ESC/POS bytes to the printer over TCP.
          </p>
        </div>
      )}

      {method === "cloud" && cloudPollUrl && (
        <div>
          <label className="block text-sm font-semibold">Printer poll URL</label>
          <code className="mt-1 block break-all rounded-lg bg-cream px-3 py-2 text-xs">
            {cloudPollUrl}
          </code>
          <p className="mt-1 text-xs text-plum-ink/50">
            Configure your CloudPRNT printer to poll this URL. (Saved after you
            pick Cloud and submit.)
          </p>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="autoPrint" defaultChecked={initial.autoPrint} />
        Auto-print each new order (server-driven methods only)
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
