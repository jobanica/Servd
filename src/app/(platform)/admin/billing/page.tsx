import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCurrentSubscription, listPlans } from "@/server/billing/subscription";
import { selectPlan, cancelSubscription } from "@/server/billing/portal-actions";
import { PayNowButton } from "@/components/admin/PayNowButton";
import { formatPeso } from "@/lib/money";

function daysLeft(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

export default async function BillingPage() {
  // allowSuspended so an owner can pay their way out of suspension here.
  const { restaurantId } = await requireAdminPage({ allowSuspended: true });
  const [sub, plans, invoices] = await Promise.all([
    getCurrentSubscription(restaurantId),
    listPlans(),
    tenantDb(restaurantId, (tx) =>
      tx.restaurantInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ),
  ]);

  const trialDays = sub?.status === "trialing" ? daysLeft(sub.trialEndsAt) : null;
  const needsPayment = sub?.status === "past_due" || (sub?.status === "trialing" && !sub.providerPaymentMethodId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Billing</h1>
      </div>

      {/* Status */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        {sub ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading text-lg font-bold">{sub.plan.name}</p>
                <p className="text-sm text-plum-ink/60">
                  {formatPeso(sub.plan.priceMonthly)}/month · status:{" "}
                  <span className="font-semibold">{sub.status}</span>
                </p>
              </div>
              {trialDays !== null && (
                <span className="rounded-full bg-mango/15 px-3 py-1 text-sm font-semibold text-mango">
                  {trialDays} day{trialDays === 1 ? "" : "s"} left in trial
                </span>
              )}
            </div>
            {sub.cancelAtPeriodEnd && (
              <p className="mt-2 text-sm text-guava">Cancels at the end of the period.</p>
            )}
            {needsPayment && (
              <div className="mt-4">
                <PayNowButton />
                <p className="mt-1 text-xs text-plum-ink/50">
                  Saved securely with PayMongo; renews automatically each month.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-plum-ink/60">No subscription on file.</p>
        )}
      </div>

      {/* Plans */}
      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Plans</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => {
            const current = sub?.planId === p.id;
            return (
              <div key={p.id} className={`rounded-tile border bg-white p-4 ${current ? "border-brand-primary" : "border-plum-ink/10"}`}>
                <p className="font-heading font-bold">{p.name}</p>
                <p className="text-sm text-plum-ink/60">{formatPeso(p.priceMonthly)}/mo</p>
                {p.modules.length > 0 && (
                  <p className="mt-1 text-xs text-plum-ink/50">
                    Includes: {p.modules.map((m) => m.module).join(", ")}
                  </p>
                )}
                {current ? (
                  <p className="mt-3 text-xs font-semibold text-brand-primary">Current plan</p>
                ) : (
                  <form action={selectPlan} className="mt-3">
                    <input type="hidden" name="planId" value={p.id} />
                    <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                      Switch to {p.name}
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoices */}
      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No invoices yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr><th className="py-2">Date</th><th>Period</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-plum-ink/10">
                  <td className="py-2">{inv.createdAt.toLocaleDateString()}</td>
                  <td>{inv.periodStart.toLocaleDateString()}–{inv.periodEnd.toLocaleDateString()}</td>
                  <td>{formatPeso(inv.amount)}</td>
                  <td>{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sub && !sub.cancelAtPeriodEnd && sub.status !== "cancelled" && (
        <form action={cancelSubscription}>
          <button className="text-xs text-muted hover:text-guava">Cancel subscription</button>
        </form>
      )}
    </div>
  );
}
