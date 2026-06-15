import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getKitchenOrders } from "@/server/orders/kitchen";
import { KitchenBoard } from "@/components/kitchen/KitchenBoard";
import { StaffDataError } from "@/components/StaffDataError";
import { signOut } from "../login/actions";

export default async function KitchenHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["kitchen", "admin"].includes(user.role)) {
    redirect("/login");
  }

  let initialOrders;
  try {
    const r = await tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { status: true } }),
    );
    if (r.status === "suspended") return redirect("/suspended");
    initialOrders = await getKitchenOrders();
  } catch (e) {
    // Let Next's redirect signal pass through.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    return (
      <StaffDataError
        title="Kitchen display"
        message={e instanceof Error ? e.message : String(e)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Kitchen display</h1>
        <div className="flex items-center gap-3">
          <a href="/clock/me" className="rounded-full px-4 py-2 text-sm font-semibold btn-brand">
            Clock in/out
          </a>
          <form action={signOut}>
            <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <p className="mb-6 text-sm text-plum-ink/60">
        New orders appear here automatically. Advance each order as you cook.
      </p>

      <KitchenBoard restaurantId={user.restaurantId} initialOrders={initialOrders} />
    </div>
  );
}
