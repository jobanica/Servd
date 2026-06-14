import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { signOut } from "../login/actions";

export default async function CashierHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "cashier") {
    redirect("/login");
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Cashier dashboard</h1>
        <form action={signOut}>
          <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
            Sign out
          </button>
        </form>
      </div>
      <p className="mt-4 text-sm text-plum-ink/60">
        Active tables, bill requests, payment & ticket printing arrive in Phase 7.
      </p>
    </div>
  );
}
