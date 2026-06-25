"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Top-of-dashboard trial countdown. New accounts start on a 30-day Business
 * trial; this ticks down to the end and nudges them to upgrade. When it hits
 * zero it switches to an "ended" message (the daily cron then downgrades them to
 * Free). Rendered only while the server says they're still on trial.
 */
export function TrialBanner({ endsAt, planName }: { endsAt: string; planName: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Avoid hydration mismatch: render a stable shell until the clock starts.
  const ms = now == null ? null : new Date(endsAt).getTime() - now;
  const ended = ms != null && ms <= 0;

  const plan = planName || "Business";

  let countdown = "";
  if (ms != null && ms > 0) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    countdown = `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-brand-primary/15 bg-brand-primary/10 px-4 py-2 text-center text-sm text-plum-ink print:hidden">
      {ended ? (
        <span>
          Your free <strong>{plan}</strong> trial has ended. Upgrade to keep your features —
          otherwise you&apos;re now on the Free plan.
        </span>
      ) : (
        <span>
          You&apos;re on a free <strong>{plan}</strong> trial —{" "}
          <strong className="tabular-nums text-brand-primary">{countdown || "…"}</strong> left. Add
          payment any time to keep every feature.
        </span>
      )}
      <Link
        href="/admin/billing"
        className="rounded-full border border-brand-primary/40 px-3 py-0.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10"
      >
        Upgrade
      </Link>
    </div>
  );
}
