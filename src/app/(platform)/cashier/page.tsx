import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCashierTables } from "@/server/orders/cashier";
import { CashierBoard } from "@/components/cashier/CashierBoard";
import { signOut } from "../login/actions";

export default async function CashierHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }
  const r = await tenantDb(user.restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { status: true } }),
  );
  if (r.status === "suspended") redirect("/suspended");

  const initialTables = await getCashierTables();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Cashier</h1>
        <div className="flex items-center gap-3">
          {user.role === "admin" && (
            <Link
              href="/admin/printing"
              className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
            >
              Printer settings
            </Link>
          )}
          <form action={signOut}>
            <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <p className="mb-6 text-sm text-plum-ink/60">
        Open tables, payments, bill requests, and ticket printing.
      </p>

      <CashierBoard restaurantId={user.restaurantId} initialTables={initialTables} />
    </div>
  );
}
