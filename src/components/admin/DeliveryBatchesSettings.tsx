"use client";

import { useMemo, useState } from "react";
import {
  BATCH_MINUTE_CHOICES,
  batchLabel,
  batchesFor,
  type DeliveryWindowsConfig,
  type ServicePeriod,
} from "@/lib/orders/delivery-windows";

/**
 * Delivery batches, in the online website settings.
 *
 * The owner thinks in service periods — lunch, dinner — and a batch length, so
 * that's what they set; the batches themselves are shown underneath as they
 * type, because "11:00–13:00 in 30s" means nothing until you see the four
 * actual windows a customer will choose from.
 *
 * Submits with the rest of the storefront form, as hidden fields. The
 * `windowsField` marker tells the save action the section was on the page.
 */
export function DeliveryBatchesSettings({ initial }: { initial: DeliveryWindowsConfig }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [periods, setPeriods] = useState<ServicePeriod[]>(
    initial.periods.length ? initial.periods : [{ start: "11:00", end: "13:00" }],
  );
  const [batchMinutes, setBatchMinutes] = useState(initial.batchMinutes);
  const [cutoff, setCutoff] = useState(initial.cutoffMinutes);

  const batches = useMemo(() => batchesFor({ periods, batchMinutes }), [periods, batchMinutes]);

  const setPeriod = (i: number, patch: Partial<ServicePeriod>) =>
    setPeriods((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const field = "rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm";

  return (
    <div className="mt-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
      <input type="hidden" name="windowsField" value="1" />
      <input type="hidden" name="windowPeriods" value={JSON.stringify(periods)} />
      <input type="hidden" name="windowBatchMinutes" value={batchMinutes} />
      <input type="hidden" name="windowCutoffMinutes" value={cutoff} />

      <label className="flex items-start gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          name="windowsEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Deliver in batches — the customer picks a delivery time
          <span className="mt-0.5 block text-xs font-normal text-plum-ink/50">
            For a rider who goes out at set times instead of once per order — a subdivision,
            a building, a campus. Customers choose a batch at checkout, and the Orders app groups
            orders by batch so the rider takes each batch in one trip.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-plum-ink/60">When you deliver</p>
            <div className="mt-1.5 space-y-2">
              {periods.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    value={p.start}
                    onChange={(e) => setPeriod(i, { start: e.target.value })}
                    className={field}
                    aria-label="From"
                  />
                  <span className="text-plum-ink/40">to</span>
                  <input
                    type="time"
                    value={p.end}
                    onChange={(e) => setPeriod(i, { end: e.target.value })}
                    className={field}
                    aria-label="Until"
                  />
                  {periods.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPeriods((ps) => ps.filter((_, j) => j !== i))}
                      className="rounded-full px-2 py-1 text-xs font-semibold text-plum-ink/45 hover:text-guava"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {periods.length < 6 && (
              <button
                type="button"
                onClick={() => setPeriods((ps) => [...ps, { start: "16:30", end: "20:00" }])}
                className="mt-2 rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold text-plum-ink/70 hover:bg-white"
              >
                + Add another time (e.g. dinner)
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="text-xs font-semibold text-plum-ink/60">
              Each batch is
              <select
                value={batchMinutes}
                onChange={(e) => setBatchMinutes(Number(e.target.value))}
                className={`ml-2 ${field}`}
              >
                {BATCH_MINUTE_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-plum-ink/60">
              Stop orders for a batch
              <select
                value={cutoff}
                onChange={(e) => setCutoff(Number(e.target.value))}
                className={`ml-2 ${field}`}
              >
                <option value={0}>when it starts</option>
                <option value={10}>10 min before</option>
                <option value={15}>15 min before</option>
                <option value={30}>30 min before</option>
                <option value={45}>45 min before</option>
                <option value={60}>1 hour before</option>
              </select>
            </label>
          </div>

          {/* The batches themselves — what customers will actually see. */}
          <div className="rounded-lg border border-plum-ink/10 bg-white p-3">
            <p className="text-xs font-semibold text-plum-ink/60">
              {batches.length} batch{batches.length === 1 ? "" : "es"} a day
            </p>
            {batches.length === 0 ? (
              <p className="mt-1 text-xs text-guava">
                No batches — check each time ends after it starts.
              </p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {batches.map((b) => (
                  <span
                    key={b.start}
                    className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-plum-ink/75"
                  >
                    {batchLabel(b)}
                  </span>
                ))}
              </div>
            )}
            {batches.length > 0 && (
              <p className="mt-2 text-xs text-plum-ink/50">
                {cutoff === 0
                  ? "Any order placed before a batch starts can go in it."
                  : `Each batch stops taking orders ${cutoff} minutes before it starts.`}{" "}
                Customers can also choose a later batch. Once the last one has started, delivery
                closes for the day — pick-up, if you offer it, stays open.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
