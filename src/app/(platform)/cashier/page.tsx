import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCashierTables, getIncomingOrders, type IncomingOrder } from "@/server/orders/cashier";
import { hasFeature } from "@/server/billing/feature-gate";
import { CashierBoard } from "@/components/cashier/CashierBoard";
import { ServiceWorkerRegister } from "@/components/offline/ServiceWorkerRegister";
import { StaffDataError } from "@/components/StaffDataError";
import { hasTutorials } from "@/server/tutorials/tutorials";

export default async function CashierHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }

  let initialTables;
  let initialIncoming: IncomingOrder[] = [];
  let offlineEnabled = false;
  try {
    const r = await tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { status: true } }),
    );
    if (r.status === "suspended") return redirect("/suspended");
    [initialTables, initialIncoming, offlineEnabled] = await Promise.all([
      getCashierTables(),
      getIncomingOrders(),
      hasFeature(user.restaurantId, "offline"),
    ]);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    return (
      <StaffDataError
        title="Cashier"
        message={e instanceof Error ? e.message : String(e)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {user.role === "admin" && (
        <Link href="/admin" className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-plum-ink/55 hover:text-plum-ink/80">
          ← Dashboard
        </Link>
      )}
      <h1 className="font-heading text-2xl font-bold">Cashier</h1>
      <p className="mb-6 text-sm text-plum-ink/60">
        Open tables, payments, bill requests, and ticket printing.
      </p>

      <CashierBoard
        restaurantId={user.restaurantId}
        initialTables={initialTables}
        initialIncoming={initialIncoming}
        isAdmin={user.role === "admin"}
        offlineEnabled={offlineEnabled}
        showTutorials={await hasTutorials()}
      />
      {offlineEnabled && <ServiceWorkerRegister />}
    </div>
  );
}
