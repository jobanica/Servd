import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCashierTables, getIncomingOrders, type IncomingOrder } from "@/server/orders/cashier";
import { CashierBoard } from "@/components/cashier/CashierBoard";
import { StaffDataError } from "@/components/StaffDataError";

export default async function CashierHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }

  let initialTables;
  let initialIncoming: IncomingOrder[] = [];
  try {
    const r = await tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { status: true } }),
    );
    if (r.status === "suspended") return redirect("/suspended");
    [initialTables, initialIncoming] = await Promise.all([
      getCashierTables(),
      getIncomingOrders(),
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
      <h1 className="font-heading text-2xl font-bold">Cashier</h1>
      <p className="mb-6 text-sm text-plum-ink/60">
        Open tables, payments, bill requests, and ticket printing.
      </p>

      <CashierBoard
        restaurantId={user.restaurantId}
        initialTables={initialTables}
        initialIncoming={initialIncoming}
        isAdmin={user.role === "admin"}
      />
    </div>
  );
}
