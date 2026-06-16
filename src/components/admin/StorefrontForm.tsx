"use client";

import { useActionState, useState } from "react";
import { updateStorefront, type StorefrontState } from "@/server/storefront/actions";
import { SubmitButton } from "./SubmitButton";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export function StorefrontForm({
  initial,
}: {
  initial: { hours: DayHours[]; zones: { name: string; feePesos: number }[] };
}) {
  const [state, action] = useActionState<StorefrontState, FormData>(updateStorefront, null);
  const [zones, setZones] = useState(initial.zones.length ? initial.zones : [{ name: "", feePesos: 0 }]);

  return (
    <form action={action} className="space-y-6">
      {/* Store hours */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Store hours</h2>
        <p className="mt-1 text-sm text-plum-ink/50">Shown on your website (Philippine time).</p>
        <div className="mt-4 space-y-2">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3">
              <span className="w-10 text-sm font-semibold text-plum-ink/70">{label}</span>
              <input type="time" name={`open_${i}`} defaultValue={initial.hours[i]?.open ?? "09:00"} className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm" />
              <span className="text-plum-ink/40">–</span>
              <input type="time" name={`close_${i}`} defaultValue={initial.hours[i]?.close ?? "21:00"} className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm" />
              <label className="flex items-center gap-1.5 text-sm text-plum-ink/60">
                <input type="checkbox" name={`closed_${i}`} defaultChecked={initial.hours[i]?.closed} /> Closed
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery zones */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Delivery zones &amp; fees</h2>
        <p className="mt-1 text-sm text-plum-ink/50">Customers pick a zone at checkout; its fee is added to the total. Leave empty for pickup-only.</p>
        <div className="mt-4 space-y-2">
          {zones.map((z, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                name="zoneName"
                defaultValue={z.name}
                placeholder="Zone (e.g. Poblacion)"
                className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-1">
                <span className="text-sm text-plum-ink/50">₱</span>
                <input
                  name="zoneFee"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={z.feePesos}
                  className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
              </div>
              <button type="button" onClick={() => setZones((p) => p.filter((_, idx) => idx !== i))} className="text-sm text-muted hover:text-guava">remove</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setZones((p) => [...p, { name: "", feePesos: 0 }])} className="mt-3 rounded-full border border-plum-ink/15 px-4 py-1.5 text-sm font-semibold">
          + Add zone
        </button>
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save storefront settings</SubmitButton>
    </form>
  );
}
