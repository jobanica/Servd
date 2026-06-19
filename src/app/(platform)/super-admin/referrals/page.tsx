import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getProgramSettings } from "@/server/referrals/settings";
import { ProgramSettingsForm } from "@/components/super-admin/ProgramSettingsForm";

export default async function SuperAdminReferralsPage() {
  await requireSuperAdminPage();
  const settings = await getProgramSettings();

  const { byStatus, fraud } = await systemDb(async (tx) => {
    const referrals = await tx.referral.groupBy({ by: ["status"], _count: true }).catch(() => []);
    const byStatus: Record<string, number> = {};
    for (const r of referrals as { status: string; _count: number }[]) byStatus[r.status] = r._count;
    const fraud = await tx.referralEvent
      .findMany({
        where: { type: "self_referral_blocked" },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, detailJson: true, createdAt: true },
      })
      .catch(() => []);
    return { byStatus, fraud };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Referral program</h1>
        <p className="text-sm text-plum-ink/50">Track 1 — restaurant-to-restaurant credit.</p>
      </div>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Program settings</h2>
        <ProgramSettingsForm
          initial={{
            track1CreditMonths: settings.track1CreditMonths,
            cookieDays: settings.cookieDays,
            clawbackDays: settings.clawbackDays,
            track2CommissionPct: settings.track2CommissionPct,
            track2ResellerPct: settings.track2ResellerPct,
            track2DurationMonths: settings.track2DurationMonths,
            payoutModel: settings.payoutModel,
            bountyAmountPesos: settings.bountyAmount / 100,
            minPayoutPesos: settings.minPayout / 100,
          }}
        />
      </section>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Referrals by status</h2>
        <div className="flex flex-wrap gap-3">
          {["signed_up", "trialing", "paying", "churned"].map((s) => (
            <div key={s} className="rounded-lg bg-cream/60 px-4 py-2">
              <p className="text-xs text-plum-ink/50">{s}</p>
              <p className="font-heading text-xl font-extrabold">{byStatus[s] ?? 0}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">
          Fraud flags — self-referral attempts ({fraud.length})
        </h2>
        {fraud.length === 0 ? (
          <p className="text-sm text-plum-ink/50">None.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5 text-sm">
            {fraud.map((f) => {
              const d = (f.detailJson ?? {}) as { reason?: string; code?: string };
              return (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-mono">{d.code ?? "—"}</span> ·{" "}
                    <span className="text-guava">{d.reason ?? "blocked"}</span>
                  </span>
                  <span className="text-xs text-plum-ink/40">{f.createdAt.toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
