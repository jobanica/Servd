import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { listEntries, listPartners } from "@/server/neighborhood/queries";
import { confirmEntries, disputeEntry, resolveEntry, syncNow } from "@/server/neighborhood/actions";
import { NbChrome, input, label, btn, btnGhost, card } from "@/components/super-admin/neighborhood/NbChrome";
import { formatPeso } from "@/lib/money";
import { formatRate, manilaDate } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const STATES = ["pending", "confirmed", "disputed", "waived", "settled", "cancelled"];
const ref = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; partner?: string; state?: string; month?: string }>;
}) {
  await requireSuperAdminPage();
  const sp = await searchParams;
  const filter = {
    partnerId: sp.partner || undefined,
    state: STATES.includes(sp.state ?? "") ? sp.state : undefined,
    month: /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month : undefined,
  };
  const [entries, partners] = await Promise.all([listEntries(filter), listPartners()]);
  const qs = new URLSearchParams(
    Object.entries({ partner: filter.partnerId, state: filter.state, month: filter.month }).filter(([, v]) => !!v) as [string, string][],
  ).toString();
  const back = `/super-admin/neighborhood/ledger${qs ? `?${qs}` : ""}`;
  // The filter rides along in `back`, so an action returns to the same view.
  const total = entries.reduce((s, e) => s + (["cancelled", "waived"].includes(e.state) ? 0 : e.commissionAmount), 0);

  return (
    <div className="space-y-6">
      <NbChrome
        active="ledger"
        title="Commission ledger"
        intro="One entry per completed platform order of a neighborhood partner, recorded as confirmed within 15 minutes of completion (or now, with Sync). Dispute or waive a line without holding up the rest of the statement."
        flash={{ ok: sp.ok, error: sp.error }}
      />

      <div className="flex flex-wrap items-end gap-2">
        <form className="flex flex-wrap items-end gap-2">
          <label>
            <span className={label}>Partner</span>
            <select name="partner" defaultValue={filter.partnerId ?? ""} className={input}>
              <option value="">All partners</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partnerName} · {p.territory.name}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>State</span>
            <select name="state" defaultValue={filter.state ?? ""} className={input}>
              <option value="">Any</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>Month</span>
            <input name="month" type="month" defaultValue={filter.month ?? ""} className={input} />
          </label>
          <button className={btnGhost}>Filter</button>
          {qs && <Link href="/super-admin/neighborhood/ledger" className="text-xs font-semibold text-brand-primary">Clear</Link>}
        </form>
        <form action={syncNow} className="ml-auto">
          <input type="hidden" name="back" value={back} />
          {filter.partnerId && <input type="hidden" name="partnerId" value={filter.partnerId} />}
          <button className={btnGhost}>Sync completed orders now</button>
        </form>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading font-bold">{entries.length} entries · {formatPeso(total)} commission</h2>
          <form id="bulk-confirm" action={confirmEntries}>
            <input type="hidden" name="back" value={back} />
            <button className={btn}>Confirm ticked</button>
          </form>
        </div>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-plum-ink/50">Nothing here yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-plum-ink/50">
                <tr>
                  <th className="py-1 pr-2"></th>
                  <th className="py-1 pr-3">Order</th>
                  <th className="py-1 pr-3">Partner</th>
                  <th className="py-1 pr-3">Commissionable</th>
                  <th className="py-1 pr-3">Rate</th>
                  <th className="py-1 pr-3">Commission</th>
                  <th className="py-1 pr-3">Paid by</th>
                  <th className="py-1 pr-3">State</th>
                  <th className="py-1">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-plum-ink/5">
                {entries.map((e) => {
                  const locked = !!e.statement && e.statement.status !== "draft";
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="py-2 pr-2">
                        {e.state === "pending" && !locked && (
                          <input type="checkbox" name="ids" value={e.id} form="bulk-confirm" aria-label="Confirm this entry" />
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {e.kind === "adjustment" ? (
                          <span className="font-semibold">Adjustment</span>
                        ) : (
                          <span className="font-semibold">{e.orderId ? ref(e.orderId) : "—"}</span>
                        )}
                        <p className="text-xs text-plum-ink/50">
                          {e.orderedAt ? manilaDate(e.orderedAt) : ""} {e.order?.orderType ?? ""} {e.order?.customerName ? `· ${e.order.customerName}` : ""}
                        </p>
                        {e.note && <p className="text-xs text-plum-ink/60">{e.note}</p>}
                      </td>
                      <td className="py-2 pr-3">{e.partner.restaurant.displayName || e.partner.restaurant.name}</td>
                      <td className="py-2 pr-3">{e.kind === "order" ? formatPeso(e.commissionableTotal) : "—"}</td>
                      <td className="py-2 pr-3">{e.kind === "order" ? formatRate(e.rateBps) : "—"}</td>
                      <td className="py-2 pr-3 font-semibold">{formatPeso(e.commissionAmount)}</td>
                      <td className="py-2 pr-3">{e.paymentMethod === "online" ? "Online" : e.paymentMethod === "cod" ? "Cash/COD" : "—"}</td>
                      <td className="py-2 pr-3">
                        <span className="capitalize">{e.state}</span>
                        {e.statement && (
                          <Link href={`/super-admin/neighborhood/statements/${e.statement.id}`} className="block text-xs text-brand-primary">
                            {e.statement.periodStart.toISOString().slice(0, 7)} ({e.statement.status})
                          </Link>
                        )}
                        {e.disputeNote && <p className="text-xs text-guava">“{e.disputeNote}”</p>}
                      </td>
                      <td className="py-2">
                        {!locked && (e.state === "pending" || e.state === "confirmed") && (
                          <form action={disputeEntry} className="flex gap-1">
                            <input type="hidden" name="back" value={back} />
                            <input type="hidden" name="id" value={e.id} />
                            <input name="note" required placeholder="Why disputed" className={`${input} w-32 py-1 text-xs`} />
                            <button className={btnGhost}>Dispute</button>
                          </form>
                        )}
                        {!locked && (e.state === "disputed" || e.state === "pending") && (
                          <div className="mt-1 flex gap-1">
                            {e.state === "disputed" && (
                              <form action={resolveEntry}>
                                <input type="hidden" name="back" value={back} />
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="outcome" value="confirmed" />
                                <button className={btnGhost}>Confirm</button>
                              </form>
                            )}
                            <form action={resolveEntry}>
                              <input type="hidden" name="back" value={back} />
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="outcome" value="waived" />
                              <button className={btnGhost}>Waive</button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
