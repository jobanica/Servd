import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
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
    tx.restaurant.findMany({ orderBy: { createdAt: "desc" } }),
  );

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
      <p className="mt-1 text-sm text-plum-ink/60">
        {restaurants.length} restaurant(s) on the platform.
      </p>

      <table className="mt-6 w-full text-left text-sm">
        <thead className="text-plum-ink/50">
          <tr>
            <th className="py-2">Name</th>
            <th>Slug</th>
            <th>Status</th>
            <th>SMS credits</th>
          </tr>
        </thead>
        <tbody>
          {restaurants.map((r) => (
            <tr key={r.id} className="border-t border-plum-ink/10">
              <td className="py-2">{r.name}</td>
              <td>/{r.slug}</td>
              <td>{r.status}</td>
              <td>{r.smsCreditBalance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
