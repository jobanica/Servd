import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { addSmsCredits, setSenderName } from "@/server/sms/admin";
import { unsuspendRestaurant } from "@/server/billing/admin-actions";
import { getPlatformMetrics } from "@/server/analytics/platform";
import { formatPeso } from "@/lib/money";
import { signOut } from "../login/actions";

/**
 * Platform super-admin (you). Runs in the trusted system context (systemDb),
 * which bypasses tenant RLS, so you can see ALL restaurants.
 */
export default async function SuperAdminHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "super") {
    redirect("/login");
  }

  const restaurants = await systemDb((tx) =>
    tx.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
      },
    }),
  );

  // MRR = sum of monthly price of subscriptions that are actively billing.
  const mrr = restaurants.reduce((sum, r) => {
    const sub = r.subscriptions[0];
    return sum + (sub && (sub.status === "active" || sub.status === "trialing") ? sub.plan.priceMonthly : 0);
  }, 0);
  const activeCount = restaurants.filter((r) => r.status === "active").length;
  const metrics = await getPlatformMetrics();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">
          Servd — platform admin
        </h1>
        <form action={signOut}>
          <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Restaurants</p>
          <p className="font-heading text-2xl font-extrabold">{restaurants.length}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Active</p>
          <p className="font-heading text-2xl font-extrabold">{activeCount}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">MRR (incl. trials)</p>
          <p className="font-heading text-2xl font-extrabold">{formatPeso(mrr)}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Orders (30d)</p>
          <p className="font-heading text-2xl font-extrabold">{metrics.orders30}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">SMS credits used</p>
          <p className="font-heading text-2xl font-extrabold">{metrics.smsCreditsUsed}</p>
        </div>
      </div>

      <table className="mt-6 w-full text-left text-sm">
        <thead className="text-plum-ink/50">
          <tr>
            <th className="py-2">Name</th>
            <th>Status</th>
            <th>Subscription</th>
            <th>SMS credits</th>
            <th>Sender name</th>
            <th>Add credits</th>
          </tr>
        </thead>
        <tbody>
          {restaurants.map((r) => {
            const sub = r.subscriptions[0];
            return (
            <tr key={r.id} className="border-t border-plum-ink/10 align-top">
              <td className="py-2">
                {r.name}
                <span className="block text-xs text-plum-ink/40">/{r.slug}</span>
              </td>
              <td className="py-2">
                {r.status}
                {r.status === "suspended" && (
                  <form action={unsuspendRestaurant} className="mt-1">
                    <input type="hidden" name="restaurantId" value={r.id} />
                    <button className="rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold">
                      Un-suspend
                    </button>
                  </form>
                )}
              </td>
              <td className="py-2 text-xs">
                {sub ? `${sub.plan.name} · ${sub.status}` : "—"}
              </td>
              <td className="py-2 font-semibold">{r.smsCreditBalance}</td>
              <td className="py-2">
                <form action={setSenderName} className="flex gap-1">
                  <input type="hidden" name="restaurantId" value={r.id} />
                  <input
                    name="senderName"
                    defaultValue={r.smsSenderName ?? ""}
                    maxLength={11}
                    placeholder="SENDER"
                    className="w-24 rounded border border-plum-ink/15 px-2 py-1 text-xs"
                  />
                  <button className="rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold">
                    Set
                  </button>
                </form>
              </td>
              <td className="py-2">
                <form action={addSmsCredits} className="flex gap-1">
                  <input type="hidden" name="restaurantId" value={r.id} />
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    placeholder="100"
                    className="w-20 rounded border border-plum-ink/15 px-2 py-1 text-xs"
                  />
                  <button className="rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold">
                    Add
                  </button>
                </form>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
