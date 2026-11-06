import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { listPartners } from "@/server/neighborhood/queries";
import { createAgreement, recordActivation } from "@/server/neighborhood/actions";
import { NbChrome, input, label, btn, btnGhost, card } from "@/components/super-admin/neighborhood/NbChrome";
import { formatPeso } from "@/lib/money";
import { formatRate, manilaDate } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const BACK = "/super-admin/neighborhood/partners";

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperAdminPage();
  const flash = await searchParams;
  const [partners, territories] = await Promise.all([
    listPartners(),
    systemDb((tx) => tx.territory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } })),
  ]);
  const unpaid = partners.filter((p) => !p.activationPaidAt && p.status !== "ended");
  const today = manilaDate(new Date());

  return (
    <div className="space-y-6">
      <NbChrome
        active="partners"
        title="Partners & activation"
        intro="One exclusive partner per territory and category. Making an agreement active moves the restaurant onto the neighborhood track; a pending one changes nothing."
        flash={flash}
      />

      <section className={card}>
        <h2 className="font-heading font-bold">Unpaid activations ({unpaid.length})</h2>
        {unpaid.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">Every activation fee is paid.</p>
        ) : (
          <ul className="mt-3 divide-y divide-plum-ink/5 text-sm">
            {unpaid.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`${BACK}/${p.id}`} className="min-w-0 flex-1 font-semibold text-brand-primary">
                  {p.partnerName} <span className="font-normal text-plum-ink/50">· {p.territory.name}</span>
                </Link>
                <span className="text-plum-ink/70">{formatPeso(p.activationFee)}</span>
                <form action={recordActivation} className="flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="back" value={BACK} />
                  <input type="hidden" name="id" value={p.id} />
                  <input name="paidOn" type="date" defaultValue={today} required className={input} />
                  <select name="method" className={input} defaultValue="gcash">
                    <option value="gcash">GCash</option>
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                  </select>
                  <input name="ref" placeholder="Reference" className={`${input} w-32`} />
                  <button className={btn}>Mark paid</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Agreements</h2>
        {partners.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">No agreements yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-plum-ink/50">
                <tr>
                  <th className="py-1 pr-3">Partner</th>
                  <th className="py-1 pr-3">Territory</th>
                  <th className="py-1 pr-3">Category</th>
                  <th className="py-1 pr-3">Rate</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Activation</th>
                  <th className="py-1">Track</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-plum-ink/5">
                {partners.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">
                      <Link href={`${BACK}/${p.id}`} className="font-semibold text-brand-primary">{p.partnerName}</Link>
                      <p className="text-xs text-plum-ink/40">{p.restaurant.slug}</p>
                    </td>
                    <td className="py-2 pr-3">{p.territory.name}</td>
                    <td className="py-2 pr-3">{p.category}{p.exclusive ? " · exclusive" : ""}</td>
                    <td className="py-2 pr-3">{formatRate(p.commissionRateBps)}</td>
                    <td className="py-2 pr-3 capitalize">{p.status}</td>
                    <td className="py-2 pr-3">
                      {p.activationPaidAt ? `Paid ${manilaDate(p.activationPaidAt)}` : <span className="font-semibold text-guava">Unpaid</span>}
                    </td>
                    <td className="py-2">{p.restaurant.commercialTrack}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">New agreement</h2>
        {territories.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">
            Add a territory first on <Link href="/super-admin/neighborhood" className="font-semibold text-brand-primary">Network &amp; territories</Link>.
          </p>
        ) : (
          <form action={createAgreement} className="mt-3 grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="back" value={BACK} />
            <label>
              <span className={label}>Territory</span>
              <select name="territoryId" required className={`${input} w-full`}>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.status})</option>
                ))}
              </select>
            </label>
            <label>
              <span className={label}>Restaurant slug</span>
              <input name="restaurantSlug" required placeholder="deca-eats-2" className={`${input} w-full`} />
            </label>
            <label>
              <span className={label}>Category</span>
              <input name="category" defaultValue="food" className={`${input} w-full`} />
            </label>
            <label>
              <span className={label}>Activation fee (₱)</span>
              <input name="activationFee" type="number" min={0} step="0.01" defaultValue="10000" className={`${input} w-full`} />
            </label>
            <label>
              <span className={label}>Commission rate (%)</span>
              <input name="ratePercent" type="number" min={0} max={100} step="0.01" defaultValue="10" className={`${input} w-full`} />
            </label>
            <label>
              <span className={label}>Status</span>
              <select name="status" defaultValue="pending" className={`${input} w-full`}>
                <option value="pending">Pending (nothing changes yet)</option>
                <option value="active">Active (neighborhood track, commission accrues)</option>
              </select>
            </label>
            <label>
              <span className={label}>Starts</span>
              <input name="startsOn" type="date" required defaultValue={today} className={`${input} w-full`} />
            </label>
            <label>
              <span className={label}>Ends (optional)</span>
              <input name="endsOn" type="date" className={`${input} w-full`} />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-sm">
              <input type="checkbox" name="exclusive" defaultChecked /> Exclusive in this territory
            </label>
            <label className="sm:col-span-3">
              <span className={label}>Notes</span>
              <input name="notes" className={`${input} w-full`} />
            </label>
            <div className="flex items-center gap-2 sm:col-span-3">
              <button className={btn}>Create agreement</button>
              <span className="text-xs text-plum-ink/50">Billing on the account isn&apos;t changed — adjust its plan separately if needed.</span>
            </div>
          </form>
        )}
      </section>
      <p className="text-xs text-plum-ink/40">
        <Link href="/super-admin/neighborhood/ledger" className={btnGhost}>Open the commission ledger</Link>
      </p>
    </div>
  );
}
