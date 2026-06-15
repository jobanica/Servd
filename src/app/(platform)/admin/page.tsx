import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getAnalytics } from "@/server/analytics/queries";
import { formatPeso } from "@/lib/money";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <p className="text-xs font-medium text-plum-ink/50">{label}</p>
      <p className="mt-1 font-heading text-3xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-plum-ink/40">{hint}</p>}
    </div>
  );
}

export default async function AdminHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    redirect("/login");
  }

  const restaurant = await tenantDb(user.restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow(),
  );
  if (restaurant.status === "suspended") redirect("/admin/billing");
  if (!restaurant.onboardingCompletedAt) redirect("/admin/onboarding");

  // Today's figures.
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const [today, openOrders] = await Promise.all([
    getAnalytics(user.restaurantId, startOfDay, now),
    tenantDb(user.restaurantId, (tx) =>
      tx.order.count({ where: { status: { in: ["new", "preparing", "done"] } } }),
    ),
  ]);

  const quick = [
    ["Add a menu item", "/admin/menu"],
    ["Print table QR", "/admin/tables"],
    ["View analytics", "/admin/analytics"],
    ["Read feedback", "/admin/feedback"],
  ];

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-heading text-2xl font-bold">
          {restaurant.displayName || restaurant.name}
        </h1>
        <p className="text-sm text-plum-ink/55">Here&apos;s how today is going.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue today" value={formatPeso(today.summary.revenue)} hint="Paid orders" />
        <Kpi label="Orders today" value={String(today.summary.orders)} />
        <Kpi label="Open orders" value={String(openOrders)} hint="Awaiting / cooking / to settle" />
        <Kpi
          label="Avg rating today"
          value={today.summary.avgRating !== null ? `${today.summary.avgRating} ★` : "—"}
        />
      </div>

      {/* Operations */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/kitchen"
          className="flex items-center justify-between rounded-tile bg-plum-ink p-6 text-cream transition hover:opacity-95"
        >
          <div>
            <p className="font-heading text-lg font-bold">Open kitchen display</p>
            <p className="text-sm text-cream/60">Live incoming orders</p>
          </div>
          <span className="text-2xl">→</span>
        </Link>
        <Link
          href="/cashier"
          className="flex items-center justify-between rounded-tile bg-brand-gradient p-6 text-white transition hover:opacity-95"
        >
          <div>
            <p className="font-heading text-lg font-bold">Open cashier</p>
            <p className="text-sm text-white/80">Tables, payments &amp; tickets</p>
          </div>
          <span className="text-2xl">→</span>
        </Link>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 font-heading text-lg font-bold">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quick.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-tile border border-plum-ink/10 bg-white p-4 text-sm font-semibold transition hover:border-brand-primary hover:shadow-sm"
            >
              {label} <span className="text-plum-ink/30">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
