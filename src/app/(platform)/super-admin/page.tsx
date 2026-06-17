import Link from "next/link";
import { getSubscriptionMetrics } from "@/server/billing/super-admin";
import { getPlatformMetrics } from "@/server/analytics/platform";
import { formatPeso } from "@/lib/money";
import { BillingRunButton } from "@/components/super-admin/BillingRunButton";

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="text-xs text-plum-ink/50">{label}</p>
      <p className={`font-heading text-2xl font-extrabold ${accent ? "text-brand-primary" : ""}`}>{value}</p>
    </div>
  );
}

export default async function SuperAdminHome() {
  const [m, platform] = await Promise.all([getSubscriptionMetrics(), getPlatformMetrics()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Overview</h1>
          <p className="text-sm text-plum-ink/50">Subscription health across the whole platform.</p>
        </div>
        <Link
          href="/super-admin/subscriptions"
          className="rounded-full px-4 py-2 text-sm font-semibold btn-brand"
        >
          Manage subscriptions →
        </Link>
      </div>

      {/* Revenue */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR (paying)" value={formatPeso(m.mrr)} accent />
        <Stat label="ARR (run-rate)" value={formatPeso(m.arr)} />
        <Stat label="MRR incl. trials" value={formatPeso(m.mrrWithTrials)} />
        <Stat label="Restaurants" value={m.total} />
      </div>

      {/* Subscription status */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active" value={m.active} />
        <Stat label="Trialing" value={m.trialing} />
        <Stat label="Past due" value={m.pastDue} />
        <Stat label="Cancelled" value={m.cancelled} />
        <Stat label="Suspended" value={m.suspended} />
        <Stat label="Trials ending ≤7d" value={m.trialsEndingSoon} />
      </div>

      {/* Usage */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders (30d)" value={platform.orders30} />
        <Stat label="SMS credits used" value={platform.smsCreditsUsed} />
        <Stat label="Active (access)" value={platform.activeRestaurants} />
      </div>

      <BillingRunButton />
    </div>
  );
}
