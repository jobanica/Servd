import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getPartnersOverview } from "@/server/partners/admin-queries";
import { setPartnerStatus, createPayoutBatch, setPayoutStatus } from "@/server/partners/admin";
import { formatPeso } from "@/lib/money";

const STATUS_CLS: Record<string, string> = {
  pending: "bg-plum-ink/5 text-plum-ink/60",
  approved: "bg-mango/15 text-mango",
  suspended: "bg-guava/15 text-guava",
  rejected: "bg-guava/15 text-guava",
};

export default async function SuperAdminPartnersPage() {
  await requireSuperAdminPage();
  const { partners, payouts } = await getPartnersOverview();
  const pending = partners.filter((p) => p.status === "pending");
  const active = partners.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Partners</h1>
        <p className="text-sm text-plum-ink/50">Affiliate / reseller applications, commissions, and payouts.</p>
      </div>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Applications ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No pending applications.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{p.name} · <span className="text-plum-ink/50">{p.tier}</span></p>
                  <p className="text-xs text-plum-ink/45">{p.email} · {p.payoutMethod}</p>
                </div>
                <div className="flex gap-2">
                  <form action={setPartnerStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="approved" />
                    <button className="rounded-lg px-3 py-1.5 text-xs font-semibold btn-brand">Approve</button>
                  </form>
                  <form action={setPartnerStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Reject</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Partners</h2>
        {active.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No active partners yet.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {active.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.name}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </p>
                  <p className="text-xs text-plum-ink/45">
                    {p.email} · {p.tier} · payable {formatPeso(p.payable)} · paid {formatPeso(p.paid)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.payable > 0 && (
                    <form action={createPayoutBatch}>
                      <input type="hidden" name="partnerId" value={p.id} />
                      <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                        Create payout
                      </button>
                    </form>
                  )}
                  <form action={setPartnerStatus}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value={p.status === "suspended" ? "approved" : "suspended"} />
                    <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                      {p.status === "suspended" ? "Reactivate" : "Suspend"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-plum-ink/40">
          Payout batches are created only when payable commissions reach the minimum threshold.
          Servd never disburses money automatically — mark as paid after sending externally.
        </p>
      </section>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="mb-3 font-heading text-lg font-bold">Payouts ({payouts.length})</h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-plum-ink/5">
            {payouts.map((po) => (
              <li key={po.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{po.partnerName}</span> · {po.period} ·{" "}
                  <span className="font-semibold">{formatPeso(po.amount)}</span>{" "}
                  <span className="text-plum-ink/45">({po.status})</span>
                </span>
                <div className="flex gap-2">
                  {po.status === "requested" && (
                    <form action={setPayoutStatus}>
                      <input type="hidden" name="id" value={po.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Approve</button>
                    </form>
                  )}
                  {po.status !== "paid" && (
                    <form action={setPayoutStatus}>
                      <input type="hidden" name="id" value={po.id} />
                      <input type="hidden" name="status" value="paid" />
                      <button className="rounded-lg px-3 py-1.5 text-xs font-semibold btn-brand">Mark paid</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
