import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCurrentSubscription, listPlans } from "@/server/billing/subscription";
import { cancelSubscription } from "@/server/billing/portal-actions";
import { PayNowButton } from "@/components/admin/PayNowButton";
import { PlanCards } from "@/components/billing/PlanCards";
import { PlanComparisonTable } from "@/components/billing/PlanComparisonTable";
import { getPublicPricing } from "@/server/billing/public-catalog";
import { formatPeso } from "@/lib/money";

function daysLeft(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

const UPGRADE_LABEL: Record<string, string> = {
  accounting: "Accounting",
  loyalty: "Loyalty & rewards",
  promotions: "Promotions",
  customers: "Customers",
  sms: "SMS marketing",
  onlineOrdering: "Online ordering",
  onlinePayments: "Online payments",
  inventory: "Inventory",
  hr: "HR & payroll",
  customDomain: "Custom domain",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string }>;
}) {
  const { upgrade } = await searchParams;
  // allowSuspended so an owner can pay their way out of suspension here.
  const { restaurantId } = await requireAdminPage({ allowSuspended: true });
  const [sub, plans, invoices, pricing] = await Promise.all([
    getCurrentSubscription(restaurantId),
    listPlans(),
    tenantDb(restaurantId, (tx) =>
      tx.restaurantInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ),
    getPublicPricing(),
  ]);

  // Map each tier name to its real plan row so the cards can switch plans.
  const planIdByName: Record<string, string> = {};
  for (const p of plans) planIdByName[p.name] = p.id;
  const priceByTier = { Free: pricing.Free.pricePesos, Growth: pricing.Growth.pricePesos, Business: pricing.Business.pricePesos };

  const trialDays = sub?.status === "trialing" ? daysLeft(sub.trialEndsAt) : null;
  const needsPayment = sub?.status === "past_due" || (sub?.status === "trialing" && !sub.providerPaymentMethodId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Billing</h1>
      </div>

      {/* Upgrade prompt (redirected here from a gated feature) */}
      {upgrade && UPGRADE_LABEL[upgrade] && (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm">
          <span className="font-semibold text-plum-ink">{UPGRADE_LABEL[upgrade]}</span> isn&apos;t
          included in your current plan. Upgrade below to unlock it.
        </div>
      )}

      {/* Free-trial banner */}
      {trialDays !== null && (
        <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/5 p-5">
          <p className="font-heading text-lg font-bold text-brand-primary">
            ✨ You&apos;re on the free trial — every feature unlocked
          </p>
          <p className="mt-1 text-sm text-plum-ink/70">
            {trialDays} day{trialDays === 1 ? "" : "s"} left. Inventory, HR, custom domain, AI
            insights, promotions and more are all included at no cost during your trial. Add a
            payment method any time to keep going after it ends.
          </p>
        </div>
      )}

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

      {/* Plans — choose / switch */}
      <div>
        <h2 className="mb-1 font-heading text-lg font-bold">Choose your plan</h2>
        <p className="mb-4 text-sm text-plum-ink/55">
          Switch any time — changes apply to your next renewal.
        </p>
        <PlanCards mode="switch" currentPlanName={sub?.plan.name ?? null} planIdByName={planIdByName} priceByTier={priceByTier} />
      </div>

      {/* Full comparison */}
      <div>
        <h2 className="mb-3 font-heading text-lg font-bold">Compare plans</h2>
        <PlanComparisonTable limitsByTier={pricing} />
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
