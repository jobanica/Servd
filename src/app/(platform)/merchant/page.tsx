import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { hasFeature } from "@/server/billing/feature-gate";
import { getMerchantOrders, type MerchantData } from "@/server/orders/merchant";
import { getPlanBannerData } from "@/server/billing/plan-status";
import { MerchantBoard } from "@/components/merchant/MerchantBoard";

// The realtime alarm screen must never be statically cached.
export const dynamic = "force-dynamic";

/** What the board starts with when the queue couldn't be read; the poll retries. */
const EMPTY_QUEUE: MerchantData = {
  incoming: [],
  active: [],
  history: [],
  upcoming: { advanceOrders: 0, bookings: 0, nextAt: null },
};

export default async function MerchantPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["merchant", "admin", "cashier"].includes(user.role)) {
    redirect("/login");
  }

  // Online ordering is the whole point of this screen — gate on the plan.
  const entitled = await hasFeature(user.restaurantId, "onlineOrdering");
  if (!entitled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
        <h1 className="font-heading text-2xl font-bold text-plum-ink">Online ordering isn&apos;t on your plan</h1>
        <p className="max-w-sm text-sm text-plum-ink/60">
          The Incoming Orders screen needs the online-ordering feature (Growth plan and up). Ask the
          restaurant owner to upgrade.
        </p>
        <Link href="/admin/billing?upgrade=onlineOrdering" className="rounded-full px-6 py-3 font-semibold btn-brand">
          See plans
        </Link>
      </div>
    );
  }

  // This screen must not sign anybody out. It is the one the shop watches for
  // orders — an unattended tablet on the counter — so a moment's trouble
  // reading the queue has to cost the queue, never the session.
  //
  // getMerchantOrders resolves the session again for itself. That used to be a
  // second round-trip that could lose a race with a token refresh and come back
  // empty, and this page answered by redirecting to /login: a signed-in
  // restaurant, signed out, while it sat there. getCurrentUser is memoised per
  // request now, so the two resolutions are one and the race is gone; but the
  // rule stands on its own. A failure renders the board empty AND SAYS SO —
  // silently showing no orders on the screen a restaurant watches for orders
  // is its own kind of wrong. The ten-second poll clears the notice.
  const [restaurant, initial, bannerData] = await Promise.all([
    tenantDb(user.restaurantId, (tx) => tx.restaurant.findFirst({ select: { name: true } })).catch(
      () => null,
    ),
    getMerchantOrders().catch(() => null),
    getPlanBannerData(user.restaurantId).catch(() => null),
  ]);

  return (
    <MerchantBoard
      restaurantId={user.restaurantId}
      restaurantName={restaurant?.name ?? "Your restaurant"}
      initial={initial ?? EMPTY_QUEUE}
      initialStale={initial === null}
      bannerData={bannerData}
    />
  );
}
