import Link from "next/link";
import { listSubscriptions } from "@/server/billing/super-admin";
import { CreateAccountForm } from "@/components/super-admin/CreateAccountForm";

export default async function SuperAdminAccountsPage() {
  const subs = await listSubscriptions();
  const recent = subs.slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Create account</h1>
        <p className="text-sm text-plum-ink/50">
          Provision a restaurant + owner login directly. The email is pre-confirmed, so they can
          sign in right away — no confirmation email. Create as many as you need.
        </p>
      </div>

      <CreateAccountForm />

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Recently added</h2>
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr className="border-b border-plum-ink/10">
                <th className="px-4 py-2">Restaurant</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.restaurantId} className="border-t border-plum-ink/5">
                  <td className="px-4 py-2 font-medium">
                    {s.restaurantName}
                    <span className="block text-xs text-plum-ink/40">/{s.slug}</span>
                  </td>
                  <td className="px-4 py-2 text-plum-ink/60">{s.status ?? "—"}</td>
                  <td className="px-4 py-2 text-plum-ink/50">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <Link href="/super-admin/subscriptions" className="text-xs font-semibold text-brand-primary">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
