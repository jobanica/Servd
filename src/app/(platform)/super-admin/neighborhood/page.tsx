import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { listTerritories, networkHealth } from "@/server/neighborhood/queries";
import { saveTerritory } from "@/server/neighborhood/actions";
import { NbChrome, Dot, input, label, btn, card } from "@/components/super-admin/neighborhood/NbChrome";
import { formatPeso } from "@/lib/money";

export const dynamic = "force-dynamic";

const BACK = "/super-admin/neighborhood";

/**
 * Neighborhood Partners: the network at a glance and its territories. A
 * separate commercial track — ₱10,000 activation + commission on platform
 * orders — that only accounts explicitly switched to 'neighborhood' enter.
 */
export default async function NeighborhoodPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperAdminPage();
  const flash = await searchParams;
  const [territories, health] = await Promise.all([listTerritories(), networkHealth()]);

  return (
    <div className="space-y-6">
      <NbChrome
        active="network"
        title="Neighborhood partners"
        intro="Exclusive territory partners: ₱10,000 activation, QR magnets to ~500 households, and commission on completed platform orders. Standard accounts never enter this module."
        flash={flash}
      />

      <section className={card}>
        <h2 className="font-heading font-bold">Network health</h2>
        {health.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">No territories yet. Add the first one below.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-plum-ink/50">
                <tr>
                  <th className="py-1 pr-3">Territory</th>
                  <th className="py-1 pr-3">Partner</th>
                  <th className="py-1 pr-3">Active</th>
                  <th className="py-1 pr-3">Producing orders (14 days)</th>
                  <th className="py-1">Collecting on time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-plum-ink/5">
                {health.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3 font-semibold">{t.name}</td>
                    <td className="py-2 pr-3 text-plum-ink/70">{t.partners.join(", ") || "—"}</td>
                    <td className="py-2 pr-3"><Dot on={t.active} label={t.active ? "Yes" : "No"} /></td>
                    <td className="py-2 pr-3"><Dot on={t.producing} label={`${t.orders14d} orders`} /></td>
                    <td className="py-2"><Dot on={t.collectingOnTime} label={t.collectingOnTime ? "On time" : t.active ? "Overdue" : "—"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Territories</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-plum-ink/50">
              <tr>
                <th className="py-1 pr-3">Territory</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Households</th>
                <th className="py-1 pr-3">Active partner(s)</th>
                <th className="py-1 pr-3">Orders this month</th>
                <th className="py-1">Commission this month</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-plum-ink/5">
              {territories.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="py-2 pr-3">
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-xs text-plum-ink/50">{[t.city, t.province].filter(Boolean).join(", ")}</p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs font-semibold text-brand-primary">Edit</summary>
                      <TerritoryForm t={t} />
                    </details>
                  </td>
                  <td className="py-2 pr-3 capitalize">{t.status}</td>
                  <td className="py-2 pr-3">{t.householdEstimate ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {t.activePartners.length === 0
                      ? "—"
                      : t.activePartners.map((p) => (
                          <Link key={p.id} href={`/super-admin/neighborhood/partners/${p.id}`} className="block font-semibold text-brand-primary">
                            {p.name} <span className="text-xs font-normal text-plum-ink/50">({p.category})</span>
                          </Link>
                        ))}
                  </td>
                  <td className="py-2 pr-3">{t.ordersThisMonth}</td>
                  <td className="py-2">{formatPeso(t.commissionThisMonth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Add a territory</h2>
        <TerritoryForm />
      </section>
    </div>
  );
}

function TerritoryForm({
  t,
}: {
  t?: { id: string; name: string; city: string | null; province: string | null; householdEstimate: number | null; status: string; notes: string | null };
}) {
  return (
    <form action={saveTerritory} className="mt-2 grid gap-2 sm:grid-cols-3">
      <input type="hidden" name="back" value={BACK} />
      {t && <input type="hidden" name="id" value={t.id} />}
      <label className="sm:col-span-3">
        <span className={label}>Name</span>
        <input name="name" required defaultValue={t?.name} placeholder="Deca Homes Tacunan" className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>City</span>
        <input name="city" defaultValue={t?.city ?? ""} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Province</span>
        <input name="province" defaultValue={t?.province ?? ""} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Households (estimate)</span>
        <input name="householdEstimate" type="number" min={0} defaultValue={t?.householdEstimate ?? ""} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Status</span>
        <select name="status" defaultValue={t?.status ?? "prospect"} className={`${input} w-full`}>
          {["prospect", "active", "paused", "closed"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className={label}>Notes</span>
        <input name="notes" defaultValue={t?.notes ?? ""} className={`${input} w-full`} />
      </label>
      <div className="sm:col-span-3">
        <button className={btn}>{t ? "Save territory" : "Add territory"}</button>
      </div>
    </form>
  );
}
