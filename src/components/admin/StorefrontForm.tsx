"use client";

import { useActionState, useEffect, useState } from "react";
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
  initial: {
    hours: DayHours[];
    zones: { name: string; feePesos: number }[];
    pauseWhenClosed: boolean;
    acceptsBookings: boolean;
    booking: {
      requireDownpayment: boolean;
      downpaymentType: "percent" | "fixed";
      downpaymentValue: number; // percent, or PESOS (already converted from centavos)
      downpaymentInstructions: string;
    };
  };
}) {
  const [state, action] = useActionState<StorefrontState, FormData>(updateStorefront, null);
  const [zones, setZones] = useState(initial.zones.length ? initial.zones : [{ name: "", feePesos: 0 }]);
  const [requireDp, setRequireDp] = useState(initial.booking.requireDownpayment);
  const [dpType, setDpType] = useState<"percent" | "fixed">(initial.booking.downpaymentType);

  // Re-seed from the server whenever the saved zones change (e.g. after a save
  // revalidates the page). Without this the fields are uncontrolled and React 19
  // resets them to empty after the form action, hiding the zone you just saved.
  const initialZonesKey = JSON.stringify(initial.zones);
  useEffect(() => {
    const next = initial.zones.length ? initial.zones : [{ name: "", feePesos: 0 }];
    setZones(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialZonesKey]);

  return (
    <form action={action} className="space-y-6">
      {/* Store hours */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Store hours</h2>
        <p className="mt-1 text-sm text-plum-ink/50">Shown on your website (Philippine time).</p>
        <div className="mt-4 space-y-2">
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="rounded-lg border border-plum-ink/10 p-3 sm:flex sm:items-center sm:gap-3 sm:border-0 sm:p-0"
            >
              {/* Day + Closed toggle */}
              <div className="flex items-center justify-between sm:contents">
                <span className="text-sm font-semibold text-plum-ink/70 sm:w-10">{label}</span>
                <label className="flex items-center gap-1.5 text-sm text-plum-ink/60 sm:order-last">
                  <input type="checkbox" name={`closed_${i}`} defaultChecked={initial.hours[i]?.closed} /> Closed
                </label>
              </div>
              {/* Open – Close (full-width on phones) */}
              <div className="mt-2 flex items-center gap-2 sm:mt-0">
                <input
                  type="time"
                  name={`open_${i}`}
                  defaultValue={initial.hours[i]?.open ?? "09:00"}
                  className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm sm:flex-none"
                />
                <span className="shrink-0 text-plum-ink/40">–</span>
                <input
                  type="time"
                  name={`close_${i}`}
                  defaultValue={initial.hours[i]?.close ?? "21:00"}
                  className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm sm:flex-none"
                />
              </div>
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="pauseWhenClosed" defaultChecked={initial.pauseWhenClosed} />
          Pause online ordering when closed
        </label>
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
                value={z.name}
                onChange={(e) =>
                  setZones((p) => p.map((zz, idx) => (idx === i ? { ...zz, name: e.target.value } : zz)))
                }
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
                  value={z.feePesos}
                  onChange={(e) =>
                    setZones((p) =>
                      p.map((zz, idx) => (idx === i ? { ...zz, feePesos: Number(e.target.value) } : zz)),
                    )
                  }
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

      {/* Advance booking & ordering */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Book &amp; order ahead</h2>
        <p className="mt-1 text-sm text-plum-ink/50">
          Adds a <span className="font-semibold text-plum-ink/70">Book / Order ahead</span> button to
          your website so customers can either reserve a table (shows under{" "}
          <span className="font-semibold text-plum-ink/70">Reservations</span>) or place a food order
          scheduled for a future date/time (shows in your orders with the requested time).
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="acceptsBookings" defaultChecked={initial.acceptsBookings} />
          Accept table bookings &amp; advance orders on my website
        </label>

        {/* Downpayment / approval */}
        <div className="mt-4 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="requireDownpayment"
              checked={requireDp}
              onChange={(e) => setRequireDp(e.target.checked)}
            />
            Require a downpayment before an advance order is approved
          </label>
          <p className="mt-1 text-xs text-plum-ink/50">
            Advance orders always land in <span className="font-semibold text-plum-ink/70">Advance orders</span> for
            you to approve. With this on, customers are shown a downpayment amount and your payment
            instructions, and enter a reference (e.g. GCash) you can verify before approving.
          </p>
          {requireDp && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  name="downpaymentType"
                  value={dpType}
                  onChange={(e) => setDpType(e.target.value as "percent" | "fixed")}
                  className="rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
                >
                  <option value="percent">% of order total</option>
                  <option value="fixed">Fixed amount (₱)</option>
                </select>
                <div className="flex items-center gap-1">
                  {dpType === "fixed" && <span className="text-sm text-plum-ink/50">₱</span>}
                  <input
                    name="downpaymentValue"
                    type="number"
                    min={0}
                    max={dpType === "percent" ? 100 : undefined}
                    step={dpType === "percent" ? 1 : 0.01}
                    defaultValue={initial.booking.downpaymentValue}
                    className="w-28 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                  />
                  {dpType === "percent" && <span className="text-sm text-plum-ink/50">%</span>}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Payment instructions (shown to the customer)</label>
                <textarea
                  name="downpaymentInstructions"
                  rows={2}
                  defaultValue={initial.booking.downpaymentInstructions}
                  placeholder="e.g. Send the downpayment via GCash to 0917-123-4567 (Juan D.), then enter the reference number below."
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          {/* Keep the hidden fields submitting even when the panel is collapsed. */}
          {!requireDp && (
            <>
              <input type="hidden" name="downpaymentType" value={dpType} />
              <input type="hidden" name="downpaymentValue" value={initial.booking.downpaymentValue} />
              <input type="hidden" name="downpaymentInstructions" value={initial.booking.downpaymentInstructions} />
            </>
          )}
        </div>
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save storefront settings</SubmitButton>
    </form>
  );
}
