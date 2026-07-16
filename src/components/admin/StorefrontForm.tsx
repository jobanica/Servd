"use client";

import { useActionState, useEffect, useState } from "react";
import { updateStorefront, type StorefrontState } from "@/server/storefront/actions";
import { LocationPicker } from "@/components/site/LocationPicker";
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
    payment: {
      codEnabled: boolean;
      codFeeEnabled: boolean;
      codFeePesos: number;
      gcashEnabled: boolean;
      gcashName: string;
      gcashNumber: string;
      gcashQrUrl: string;
    };
    delivery: {
      mode: "zones" | "distance";
      baseFeePesos: number;
      perKmPesos: number;
      freeKm: number;
      minFeePesos: number;
      maxKm: number;
      roadFactor: number;
      originLat: number | null;
      originLng: number | null;
    };
  };
}) {
  const [state, action] = useActionState<StorefrontState, FormData>(updateStorefront, null);
  const [zones, setZones] = useState(initial.zones.length ? initial.zones : [{ name: "", feePesos: 0 }]);
  const [requireDp, setRequireDp] = useState(initial.booking.requireDownpayment);
  const [dpType, setDpType] = useState<"percent" | "fixed">(initial.booking.downpaymentType);
  const [gcashOn, setGcashOn] = useState(initial.payment.gcashEnabled);
  const [codFeeOn, setCodFeeOn] = useState(initial.payment.codFeeEnabled);
  const [deliveryMode, setDeliveryMode] = useState<"zones" | "distance">(initial.delivery.mode);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(
    initial.delivery.originLat != null && initial.delivery.originLng != null
      ? { lat: initial.delivery.originLat, lng: initial.delivery.originLng }
      : null,
  );

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

      {/* Delivery pricing */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Delivery fees</h2>
        <p className="mt-1 text-sm text-plum-ink/50">Choose how the delivery fee is worked out. Leave zones empty (or fees at 0) for pickup-only.</p>

        <input type="hidden" name="deliveryMode" value={deliveryMode} />
        <input type="hidden" name="originLat" value={origin?.lat ?? ""} />
        <input type="hidden" name="originLng" value={origin?.lng ?? ""} />

        {/* Mode toggle */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-plum-ink/5 p-1 sm:max-w-sm">
          <button type="button" onClick={() => setDeliveryMode("zones")} className={`rounded-md py-2 text-sm font-semibold ${deliveryMode === "zones" ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"}`}>
            📍 By zone
          </button>
          <button type="button" onClick={() => setDeliveryMode("distance")} className={`rounded-md py-2 text-sm font-semibold ${deliveryMode === "distance" ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"}`}>
            📏 By distance
          </button>
        </div>

        {/* Zones editor (kept mounted so values persist when switching modes). */}
        <div className={deliveryMode === "zones" ? "mt-4" : "hidden"}>
          <p className="mb-2 text-sm text-plum-ink/50">Customers pick a zone at checkout; its fee is added to the total.</p>
          <div className="space-y-2">
            {zones.map((z, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  name="zoneName"
                  value={z.name}
                  onChange={(e) => setZones((p) => p.map((zz, idx) => (idx === i ? { ...zz, name: e.target.value } : zz)))}
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
                    onChange={(e) => setZones((p) => p.map((zz, idx) => (idx === i ? { ...zz, feePesos: Number(e.target.value) } : zz)))}
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

        {/* Distance settings — numeric inputs stay mounted; only the map mounts
            in distance mode (Leaflet needs a visible container). */}
        <div className={deliveryMode === "distance" ? "mt-4 space-y-4" : "hidden"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Base fee (₱)</span>
              <input name="baseFeePesos" type="number" step="0.01" min={0} defaultValue={initial.delivery.baseFeePesos} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Per km (₱)</span>
              <input name="perKmPesos" type="number" step="0.01" min={0} defaultValue={initial.delivery.perKmPesos} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Free within (km)</span>
              <input name="freeKm" type="number" step="0.1" min={0} defaultValue={initial.delivery.freeKm} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Minimum fee (₱)</span>
              <input name="minFeePesos" type="number" step="0.01" min={0} defaultValue={initial.delivery.minFeePesos} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Max distance (km, 0 = no limit)</span>
              <input name="maxKm" type="number" step="0.1" min={0} defaultValue={initial.delivery.maxKm} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-semibold text-plum-ink/60">Road factor (≈ road vs straight line)</span>
              <input name="roadFactor" type="number" step="0.05" min={1} defaultValue={initial.delivery.roadFactor} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" /></label>
          </div>
          <p className="text-xs text-plum-ink/45">
            Fee = base + (distance − free km) × per-km, but never below the minimum. Distance is straight-line ×
            road factor. e.g. base ₱30, ₱10/km, 1 km free → 4 km away ≈ ₱30 + 3×₱10 = ₱60.
          </p>
          <div>
            <p className="mb-1 text-sm font-semibold text-plum-ink/60">Your store location (drop the pin on your store)</p>
            {deliveryMode === "distance" && (
              <LocationPicker initial={origin} onChange={(lat, lng) => setOrigin({ lat, lng })} />
            )}
            {!origin && <p className="mt-1 text-xs text-guava">Pin your store so we can measure distance to each customer.</p>}
          </div>
        </div>
      </div>

      {/* Payment methods */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Payment methods</h2>
        <p className="mt-1 text-sm text-plum-ink/50">
          How online customers can pay. Cash means they pay on pickup/delivery. GCash shows your QR
          code at checkout for the customer to scan, then they enter their reference number.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="codEnabled" defaultChecked={initial.payment.codEnabled} />
          Cash (on pickup / delivery)
        </label>

        {/* COD fee — an extra charge on cash-on-delivery orders. */}
        <div className="mt-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="codFeeEnabled" checked={codFeeOn} onChange={(e) => setCodFeeOn(e.target.checked)} />
            Charge a COD fee on cash-on-delivery orders
          </label>
          <p className="mt-1 text-xs text-plum-ink/50">
            Added on top of the delivery fee when a <span className="font-semibold text-plum-ink/70">delivery</span> order
            is paid by cash. Not charged on pickup or GCash-paid orders.
          </p>
          {codFeeOn ? (
            <div className="mt-2 flex items-center gap-1">
              <span className="text-sm text-plum-ink/50">₱</span>
              <input
                name="codFeePesos"
                type="number"
                step="0.01"
                min={0}
                defaultValue={initial.payment.codFeePesos}
                placeholder="0.00"
                className="w-32 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
              />
              <span className="text-sm text-plum-ink/50">COD fee</span>
            </div>
          ) : (
            <input type="hidden" name="codFeePesos" value={initial.payment.codFeePesos} />
          )}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="gcashEnabled" checked={gcashOn} onChange={(e) => setGcashOn(e.target.checked)} />
          GCash
        </label>
        {gcashOn && (
          <div className="mt-3 space-y-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-plum-ink/60">GCash account name</label>
                <input name="gcashName" defaultValue={initial.payment.gcashName} placeholder="e.g. Juan D." className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-plum-ink/60">GCash number</label>
                <input name="gcashNumber" defaultValue={initial.payment.gcashNumber} inputMode="tel" placeholder="09XX XXX XXXX" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-plum-ink/60">GCash QR code</label>
              <div className="flex items-center gap-3">
                {initial.payment.gcashQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={initial.payment.gcashQrUrl} alt="GCash QR" className="h-20 w-20 rounded-lg border border-plum-ink/10 object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-plum-ink/20 text-2xl">📷</div>
                )}
                <div className="min-w-0">
                  <input type="file" name="gcashQr" accept="image/png,image/jpeg,image/webp" className="text-xs" />
                  <p className="mt-1 text-xs text-plum-ink/45">Upload a screenshot of your GCash “Receive money” QR. Max 5 MB.</p>
                </div>
              </div>
              {/* Preserve the existing QR when no new file is chosen. */}
              <input type="hidden" name="gcashQrUrl" value={initial.payment.gcashQrUrl} />
            </div>
          </div>
        )}
        {!gcashOn && <input type="hidden" name="gcashQrUrl" value={initial.payment.gcashQrUrl} />}
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
