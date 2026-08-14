import { TIERS, POPULAR_TIER, FEATURE_GROUPS, type Cell, type FeatureRow, type Tier } from "@/lib/billing/catalog";

export interface TierLimits {
  /** Kept for the plan editor; table QRs are no longer a per-plan limit —
      every plan includes one and unlimited is a one-time unlock. */
  maxTables?: number;
  maxStaff?: number;
  smsIncluded?: number;
}

/** Override the limit rows with live DB values when provided. */
function liveCell(label: string, tier: Tier, limits: TierLimits | undefined, fallback: Cell): Cell {
  if (!limits) return fallback;
  if (label === "Staff accounts") return limits.maxStaff != null ? String(limits.maxStaff) : "Unlimited";
  if (label === "SMS marketing credits") return limits.smsIncluded ? `${limits.smsIncluded.toLocaleString()} / mo` : "—";
  return fallback;
}

function CellView({ cell }: { cell: Cell }) {
  if (cell === true) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-4 w-4 text-brand-primary">
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (cell === false) return <span className="text-plum-ink/25">—</span>;
  return <span className="text-sm font-medium text-plum-ink/80">{cell}</span>;
}

/** Full feature matrix across all three tiers (columns follow TIERS order). */
export function PlanComparisonTable({ limitsByTier }: { limitsByTier?: Partial<Record<Tier, TierLimits>> }) {
  return (
    <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-plum-ink/10">
            <th className="px-4 py-3 font-heading text-sm font-bold">Features</th>
            {TIERS.map((t) => (
              <th
                key={t}
                className={`px-4 py-3 text-center font-heading text-sm font-bold ${
                  t === POPULAR_TIER ? "text-brand-primary" : ""
                }`}
              >
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_GROUPS.map((g) => (
            <FeatureGroupRows key={g.group} group={g.group} rows={g.rows} limitsByTier={limitsByTier} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureGroupRows({
  group,
  rows,
  limitsByTier,
}: {
  group: string;
  rows: FeatureRow[];
  limitsByTier?: Partial<Record<Tier, TierLimits>>;
}) {
  return (
    <>
      <tr className="bg-cream/60">
        <td colSpan={TIERS.length + 1} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-plum-ink/45">
          {group}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.label} className="border-t border-plum-ink/5">
          <td className="px-4 py-2.5 text-plum-ink/75">{r.label}</td>
          {TIERS.map((t: Tier) => (
            <td
              key={t}
              className={`px-4 py-2.5 text-center ${t === POPULAR_TIER ? "bg-brand-primary/[0.03]" : ""}`}
            >
              <CellView cell={liveCell(r.label, t, limitsByTier?.[t], r[t])} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
