import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getLoyaltyConfig, getLoyaltyMembers } from "@/server/loyalty/loyalty";
import { formatPeso } from "@/lib/money";
import { LoyaltyForm } from "@/components/admin/LoyaltyForm";

export default async function LoyaltyPage() {
  const { restaurantId } = await requireAdminPage();
  const [cfg, members] = await Promise.all([
    getLoyaltyConfig(restaurantId),
    getLoyaltyMembers(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Loyalty &amp; rewards</h1>
        <p className="text-sm text-plum-ink/50">
          Customers earn points on every paid order (by phone number in the app) and redeem them
          as a discount — the cashier confirms redemption at checkout.
        </p>
      </div>

      <LoyaltyForm
        initial={{
          enabled: cfg.enabled,
          pesosPerPoint: cfg.pesosPerPoint,
          pointValuePesos: cfg.pointValue / 100,
        }}
      />

      {/* Members */}
      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">
          Members <span className="text-plum-ink/40">({members.length})</span>
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-plum-ink/50">
            No members yet. Customers join from the app&apos;s Rewards section.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr className="border-b border-plum-ink/10">
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2 text-right">Points</th>
                  <th className="px-4 py-2 text-right">Value</th>
                  <th className="px-4 py-2 text-right">Total earned</th>
                  <th className="px-4 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.phone} className="border-t border-plum-ink/5">
                    <td className="px-4 py-2 font-medium">{m.name ?? "—"}</td>
                    <td className="px-4 py-2 text-plum-ink/70">{m.phone}</td>
                    <td className="px-4 py-2 text-right font-semibold">{m.points}</td>
                    <td className="px-4 py-2 text-right text-plum-ink/60">
                      {formatPeso(m.points * cfg.pointValue)}
                    </td>
                    <td className="px-4 py-2 text-right text-plum-ink/60">{m.totalEarned}</td>
                    <td className="px-4 py-2 text-plum-ink/50">
                      {new Date(m.joinedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
