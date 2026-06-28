"use client";

import { useMemo, useState } from "react";
import {
  computeEarnings,
  formatPHP,
  type PartnerProgram,
} from "@/lib/partners/program";

/**
 * Interactive earnings illustration. All state is in React (no storage). Rates +
 * tiers come from the shared program config so this can never disagree with the
 * payout engine.
 */
export function EarningsCalculator({ program }: { program: PartnerProgram }) {
  const [restaurants, setRestaurants] = useState(10);
  const [price, setPrice] = useState(program.defaultPlanPricePesos);

  const earnings = useMemo(
    () => computeEarnings({ restaurants, monthlyPricePesos: price }, program),
    [restaurants, price, program],
  );

  const quickPicks = [5, 10, 25, 50, 100, program.maxReferralsSlider];

  return (
    <div className="grid gap-6 rounded-tile border border-plum-ink/10 bg-white p-6 lg:grid-cols-2">
      {/* Inputs */}
      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="restaurants" className="text-sm font-semibold text-plum-ink/70">
              Restaurants you refer
            </label>
            <span className="font-heading text-xl font-extrabold text-brand-primary">
              {restaurants}
            </span>
          </div>
          <input
            id="restaurants"
            type="range"
            min={1}
            max={program.maxReferralsSlider}
            value={restaurants}
            onChange={(e) => setRestaurants(Number(e.target.value))}
            className="mt-2 w-full accent-[#FF7A1A]"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickPicks.map((n) => (
              <button
                key={n}
                onClick={() => setRestaurants(n)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  restaurants === n
                    ? "bg-brand-gradient text-white"
                    : "bg-plum-ink/5 text-plum-ink/60 hover:bg-plum-ink/10"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="price" className="text-sm font-semibold text-plum-ink/70">
            Example monthly plan price
          </label>
          <div className="mt-2 flex items-center rounded-lg border border-plum-ink/15 px-3">
            <span className="text-plum-ink/50">₱</span>
            <input
              id="price"
              type="number"
              min={0}
              step={100}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
              className="w-full bg-transparent px-2 py-2.5 text-sm outline-none"
            />
            <span className="text-xs text-plum-ink/40">/mo</span>
          </div>
        </div>
      </div>

      {/* Outputs */}
      <div className="space-y-3 rounded-xl bg-cream/70 p-5">
        <Row label={`Year-1 commission (${program.firstYearPct}%)`} value={formatPHP(earnings.yearOneCommission)} />
        <Row
          label="Milestone bonuses unlocked"
          value={earnings.bonusesUnlocked > 0 ? formatPHP(earnings.bonusesUnlocked) : "—"}
          sub={
            earnings.bonusTiersReached.length
              ? earnings.bonusTiersReached.map((t) => `${t.activeReferrals}`).join(" · ") + " tiers"
              : "reach 10 referrals to unlock"
          }
        />
        <div className="my-1 border-t border-plum-ink/10" />
        <Row label="First-year total" value={formatPHP(earnings.firstYearTotal)} big />
        <Row
          label={`Then ongoing (${program.lifetimePct}% for life)`}
          value={`~${formatPHP(earnings.ongoingPerYear)}/yr`}
          accent
        />
        <p className="pt-1 text-[11px] leading-relaxed text-plum-ink/45">
          Illustration only. Actual earnings depend on the plans your restaurants choose and how
          long they stay subscribed.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  big,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-plum-ink/70">{label}</p>
        {sub && <p className="text-[11px] text-plum-ink/40">{sub}</p>}
      </div>
      <p
        className={`shrink-0 font-heading font-extrabold ${
          big ? "text-2xl" : "text-lg"
        } ${accent ? "text-brand-primary" : "text-plum-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}
