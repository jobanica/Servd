"use client";

import { useEffect, useState } from "react";
import { formatPeso } from "@/lib/money";
import { getMyLoyalty } from "@/server/loyalty/public";

/**
 * Diner rewards: enter a phone number to track loyalty points. The phone is
 * remembered and attached to future orders so points accrue automatically.
 */
export function RewardsPanel({
  slug,
  phone,
  onPhone,
}: {
  slug: string;
  phone: string;
  onPhone: (phone: string) => void;
}) {
  const [input, setInput] = useState(phone);
  const [points, setPoints] = useState<number | null>(null);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);

  async function check(p: string) {
    if (!p.trim()) return;
    setBusy(true);
    const res = await getMyLoyalty(slug, p.trim());
    setBusy(false);
    if (res) {
      setPoints(res.points);
      setValue(res.points * res.pointValue);
      onPhone(p.trim());
    }
  }

  // Auto-load balance if we already know the phone.
  useEffect(() => {
    if (phone) check(phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-tile border border-brand-primary/20 bg-brand-primary/5 p-4">
      <p className="font-heading font-bold text-brand-ink">⭐ Rewards</p>
      <p className="mt-0.5 text-xs text-brand-ink/60">
        Earn points on every order. Enter your phone to track them.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          inputMode="tel"
          placeholder="09xx xxx xxxx"
          className="min-w-0 flex-1 rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
        />
        <button
          onClick={() => check(input)}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60"
        >
          {busy ? "…" : "Check"}
        </button>
      </div>
      {points !== null && (
        <p className="mt-3 text-sm text-brand-ink">
          You have <span className="font-bold">{points} points</span>
          {value > 0 && <span className="text-brand-ink/60"> (worth {formatPeso(value)})</span>}.
          <br />
          <span className="text-xs text-brand-ink/50">Show this phone to the cashier to redeem.</span>
        </p>
      )}
    </div>
  );
}
