import Link from "next/link";
import { TIERS, TIER_INFO, POPULAR_TIER, type Tier } from "@/lib/billing/catalog";
import { selectPlan } from "@/server/billing/portal-actions";

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * The three pricing cards. Two modes:
 *   - "signup": CTA links to /signup (public landing page).
 *   - "switch": CTA switches the current restaurant's plan (billing page) —
 *     needs `planIdByName` to map a tier to its real DB plan row.
 */
export function PlanCards({
  mode,
  currentPlanName,
  planIdByName,
}: {
  mode: "signup" | "switch";
  currentPlanName?: string | null;
  planIdByName?: Record<string, string>;
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      {TIERS.map((tier: Tier) => {
        const info = TIER_INFO[tier];
        const featured = tier === POPULAR_TIER;
        const isCurrent = mode === "switch" && currentPlanName === tier;
        const planId = planIdByName?.[tier];

        return (
          <div
            key={tier}
            className={`rounded-tile border bg-white p-7 ${
              featured ? "border-brand-primary shadow-xl ring-2 ring-brand-primary/20" : "border-plum-ink/10"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-plum-ink/40">{info.name}</span>
              {featured && (
                <span className="rounded-full bg-brand-gradient px-2.5 py-0.5 text-[10px] font-bold text-white">
                  Most popular
                </span>
              )}
              {isCurrent && (
                <span className="rounded-full bg-mango/15 px-2.5 py-0.5 text-[10px] font-bold text-mango">
                  Current
                </span>
              )}
            </div>

            <p className="mt-3">
              <span className="font-heading text-4xl font-extrabold">₱{info.pricePesos.toLocaleString()}</span>
              <span className="text-plum-ink/50">/month</span>
            </p>
            <p className="mt-1 text-sm text-plum-ink/60">{info.tagline}</p>

            <ul className="mt-5 space-y-2.5">
              {info.highlights.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-plum-ink/75">
                  <Check />
                  {f}
                </li>
              ))}
            </ul>

            {mode === "signup" ? (
              <Link
                href="/signup"
                className={`mt-6 block rounded-full py-3 text-center font-semibold ${
                  featured ? "btn-brand text-white" : "border border-plum-ink/15"
                }`}
              >
                Start free trial
              </Link>
            ) : isCurrent ? (
              <p className="mt-6 rounded-full border border-brand-primary/30 bg-brand-primary/5 py-3 text-center text-sm font-semibold text-brand-primary">
                Your current plan
              </p>
            ) : planId ? (
              <form action={selectPlan} className="mt-6">
                <input type="hidden" name="planId" value={planId} />
                <button
                  className={`block w-full rounded-full py-3 text-center font-semibold ${
                    featured ? "btn-brand text-white" : "border border-plum-ink/15"
                  }`}
                >
                  Switch to {info.name}
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-full border border-plum-ink/10 py-3 text-center text-sm text-plum-ink/40">
                Unavailable
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
