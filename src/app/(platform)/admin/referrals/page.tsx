import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getReferralDashboard } from "@/server/referrals/dashboard";
import { ReferralLink } from "@/components/admin/ReferralLink";
import { formatPeso } from "@/lib/money";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  signed_up: { label: "Signed up", cls: "bg-plum-ink/5 text-plum-ink/60" },
  trialing: { label: "Trialing", cls: "bg-plum-ink/5 text-plum-ink/60" },
  paying: { label: "Paying ✓", cls: "bg-mango/15 text-mango" },
  churned: { label: "Churned", cls: "bg-guava/15 text-guava" },
};

export default async function ReferralsPage() {
  const { restaurantId } = await requireAdminPage();
  const data = await getReferralDashboard(restaurantId);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = `${base.replace(/\/$/, "")}/signup?ref=${data.code}`;

  if (!data.ready) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">
            ← Dashboard
          </Link>
          <h1 className="font-heading text-2xl font-bold">Refer &amp; earn</h1>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
          <p className="text-3xl">🛠️</p>
          <p className="mt-2 font-semibold">The referral program is being set up.</p>
          <p className="mt-1 text-sm text-plum-ink/55">Please check back shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Refer &amp; earn</h1>
        <p className="text-sm text-plum-ink/50">
          Invite another restaurant. When they subscribe and pay their first month,
          <strong> you both get a free month</strong> — applied to your Servd bill.
        </p>
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Your referral link</p>
        <div className="mt-2">
          <ReferralLink url={link} />
        </div>
        <p className="mt-2 text-xs text-plum-ink/45">
          Your code: <span className="font-mono font-semibold">{data.code}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="text-xs text-plum-ink/50">Credit earned (pending)</p>
          <p className="font-heading text-2xl font-extrabold text-mango">
            {formatPeso(data.pendingCredit)}
          </p>
          <p className="mt-1 text-xs text-plum-ink/45">Applied automatically to an upcoming invoice.</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="text-xs text-plum-ink/50">Credit already applied</p>
          <p className="font-heading text-2xl font-extrabold">{formatPeso(data.appliedCredit)}</p>
        </div>
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="mb-3 text-sm font-semibold">Restaurants you referred</p>
        {data.referrals.length === 0 ? (
          <p className="text-sm text-plum-ink/50">
            No referrals yet. Share your link to start earning.
          </p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {data.referrals.map((r) => {
              const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.signed_up;
              return (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-plum-ink/45">
                      Joined {r.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-plum-ink/40">
        Rewards apply only after the referred restaurant pays its first full month, and may be
        reversed if they refund or cancel within the clawback window.
      </p>
    </div>
  );
}
