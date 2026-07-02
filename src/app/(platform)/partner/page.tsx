import { requirePartnerPage } from "@/server/partners/auth";
import { getPartnerDashboard } from "@/server/partners/portal";
import { listPartnerDemos } from "@/server/partners/demo-queries";
import { ReferralLink } from "@/components/admin/ReferralLink";
import { PartnerDemos } from "@/components/partner/PartnerDemos";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { formatPeso } from "@/lib/money";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  signed_up: { label: "Signed up", cls: "bg-plum-ink/5 text-plum-ink/60" },
  trialing: { label: "Trialing", cls: "bg-plum-ink/5 text-plum-ink/60" },
  paying: { label: "Paying ✓", cls: "bg-mango/15 text-mango" },
  churned: { label: "Churned", cls: "bg-guava/15 text-guava" },
};

export default async function PartnerPortalPage() {
  const partner = await requirePartnerPage();

  if (partner.status !== "approved") {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-3xl">{partner.status === "suspended" ? "⛔" : "⏳"}</p>
        <h1 className="mt-2 font-heading text-2xl font-bold">
          {partner.status === "suspended" ? "Account suspended" : "Application under review"}
        </h1>
        <p className="mt-2 text-plum-ink/60">
          {partner.status === "suspended"
            ? "Your partner account is currently suspended. Contact Servd support."
            : "Thanks for applying! We'll email you once your partner account is approved."}
        </p>
      </div>
    );
  }

  const data = await getPartnerDashboard(partner.id, true);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = data.code ? `${base.replace(/\/$/, "")}/signup?ref=${data.code}` : "";
  const demos = await listPartnerDemos(partner.id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppIcon size={26} />
          <Wordmark size="1.1rem" />
        </div>
        <span className="text-sm text-plum-ink/50">
          {partner.name} · {partner.tier}
        </span>
      </div>

      <h1 className="mt-6 font-heading text-2xl font-bold">Partner dashboard</h1>

      <div className="mt-4 rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">Your referral link</p>
        {link ? (
          <div className="mt-2">
            <ReferralLink url={link} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-plum-ink/50">Your link is being generated…</p>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="text-xs text-plum-ink/50">Accrued (awaiting payout)</p>
          <p className="font-heading text-2xl font-extrabold text-mango">{formatPeso(data.accrued)}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="text-xs text-plum-ink/50">Paid out</p>
          <p className="font-heading text-2xl font-extrabold">{formatPeso(data.paid)}</p>
        </div>
      </div>

      <div className="mt-4">
        <PartnerDemos demos={demos} appUrl={base} />
      </div>

      <div className="mt-4 rounded-tile border border-plum-ink/10 bg-white p-5">
        <p className="mb-3 text-sm font-semibold">Restaurants you referred</p>
        {data.referrals.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No referrals yet. Share your link to start earning.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {data.referrals.map((r) => {
              const s = STATUS_LABEL[r.status] ?? STATUS_LABEL.signed_up;
              return (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-plum-ink/45">Joined {r.createdAt.toLocaleDateString()}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {data.payouts.length > 0 && (
        <div className="mt-4 rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="mb-3 text-sm font-semibold">Payout history</p>
          <ul className="divide-y divide-plum-ink/5 text-sm">
            {data.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>{p.period}</span>
                <span className="font-semibold">{formatPeso(p.amount)}</span>
                <span className="text-xs text-plum-ink/50">{p.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-xs text-plum-ink/40">
        Commissions accrue on the referred restaurant&apos;s paid invoices and may be reversed if
        they refund or cancel within the clawback window. Payouts are reviewed and sent manually.
      </p>
    </div>
  );
}
