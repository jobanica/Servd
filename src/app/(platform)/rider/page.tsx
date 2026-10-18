import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { hasFeature } from "@/server/billing/feature-gate";
import { getRiderBoard, type RiderBoard } from "@/server/rider/actions";
import { RiderApp } from "@/components/rider/RiderApp";

export const dynamic = "force-dynamic";

const EMPTY: RiderBoard = {
  orders: [],
  today: { delivered: 0, cash: 0, gcash: 0, prepaid: 0, collected: 0 },
  deliveries: [],
};

export default async function RiderPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["rider", "admin"].includes(user.role)) {
    redirect("/rider/login");
  }

  // Riders carry the shop's delivery orders, which come from online ordering.
  if (!(await hasFeature(user.restaurantId, "onlineOrdering"))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
        <h1 className="font-heading text-2xl font-bold text-plum-ink">Online ordering isn&apos;t on your plan</h1>
        <p className="max-w-sm text-sm text-plum-ink/60">
          The Rider app works with online delivery orders. Ask the restaurant owner to upgrade.
        </p>
        <Link href="/rider/login" className="rounded-full px-6 py-3 font-semibold btn-brand">
          Back
        </Link>
      </div>
    );
  }

  const [restaurant, me, initial] = await Promise.all([
    tenantDb(user.restaurantId, (tx) => tx.restaurant.findFirst({ select: { name: true, displayName: true } })).catch(
      () => null,
    ),
    tenantDb(user.restaurantId, (tx) =>
      tx.staffUser.findFirst({ where: { id: user.staffUserId }, select: { displayName: true, email: true } }),
    ).catch(() => null),
    getRiderBoard().catch(() => null),
  ]);

  return (
    <RiderApp
      restaurantId={user.restaurantId}
      restaurantName={restaurant?.displayName || restaurant?.name || "Your restaurant"}
      riderName={me?.displayName?.trim() || me?.email?.split("@")[0] || "Rider"}
      initial={initial ?? EMPTY}
    />
  );
}
