import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getStatement } from "@/server/neighborhood/queries";
import { generateStatementAction, issueStatementAction, recordPaymentAction, writeOffAction } from "@/server/neighborhood/actions";
import { NbChrome, input, label, btn, btnGhost, card } from "@/components/super-admin/neighborhood/NbChrome";
import { formatPeso } from "@/lib/money";
import { formatRate, manilaDate } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const ref = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperAdminPage();
  const { id } = await params;
  const flash = await searchParams;
  const s = await getStatement(id);
  if (!s) notFound();

  const back = `/super-admin/neighborhood/statements/${s.id}`;
  const name = s.partner.restaurant.displayName || s.partner.restaurant.name;
  const month = s.periodStart.toISOString().slice(0, 7);
  const balance = Math.max(0, s.commissionDue - s.amountPaid);
  const open = s.status === "issued" || s.status === "partially_paid";

  return (
    <div className="space-y-6">
      <NbChrome active="statements" title={`${name} — ${month}`} intro={`${s.partner.territory.name} · status: ${s.status.replace("_", " ")}`} flash={flash} />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs font-semibold text-plum-ink/50">Orders</p><p className="font-heading text-xl font-extrabold">{s.orderCount}</p></div>
        <div className={card}><p className="text-xs font-semibold text-plum-ink/50">Gross (commissionable)</p><p className="font-heading text-xl font-extrabold">{formatPeso(s.grossOrders)}</p></div>
        <div className={card}><p className="text-xs font-semibold text-plum-ink/50">Commission due</p><p className="font-heading text-xl font-extrabold">{formatPeso(s.commissionDue)}</p></div>
        <div className={card}><p className="text-xs font-semibold text-plum-ink/50">Balance</p><p className="font-heading text-xl font-extrabold">{formatPeso(balance)}</p></div>
      </div>

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/neighborhood-statement/${s.id}`} target="_blank" className={btnGhost}>Print / save as PDF</Link>
          <Link href={`/super-admin/neighborhood/partners/${s.territoryPartnerId}`} className={btnGhost}>Partner</Link>
        </div>

        {s.status === "draft" && (
          <div className="flex flex-wrap items-end gap-2">
            <form action={generateStatementAction}>
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="partnerId" value={s.territoryPartnerId} />
              <input type="hidden" name="month" value={month} />
              <button className={btnGhost}>Rebuild draft</button>
            </form>
            <form action={issueStatementAction} className="flex items-end gap-2">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="id" value={s.id} />
              <label>
                <span className={label}>Due in (days)</span>
                <input name="dueDays" type="number" min={0} max={90} defaultValue={7} className={`${input} w-20`} />
              </label>
              <button className={btn}>Issue statement</button>
            </form>
            <p className="w-full text-xs text-plum-ink/50">Once issued it can&apos;t be changed — corrections go in as an adjustment on the next one.</p>
          </div>
        )}

        {s.status !== "draft" && (
          <p className="text-sm text-plum-ink/70">
            Issued {s.issuedAt ? manilaDate(s.issuedAt) : "—"} · due {s.dueAt ? s.dueAt.toISOString().slice(0, 10) : "—"}
            {s.paidAt ? ` · paid ${manilaDate(s.paidAt)}` : ""} · paid so far {formatPeso(s.amountPaid)}
            {s.writeOffReason ? ` · written off: ${s.writeOffReason}` : ""}
          </p>
        )}

        {open && (
          <div className="flex flex-wrap items-end gap-4">
            <form action={recordPaymentAction} className="flex items-end gap-2">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="id" value={s.id} />
              <label>
                <span className={label}>Payment received (₱)</span>
                <input name="amount" type="number" min={0.01} step="0.01" defaultValue={(balance / 100).toFixed(2)} className={`${input} w-36`} />
              </label>
              <button className={btn}>Record payment</button>
            </form>
            <form action={writeOffAction} className="flex items-end gap-2">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="id" value={s.id} />
              <label>
                <span className={label}>Write off — reason</span>
                <input name="reason" required className={`${input} w-56`} />
              </label>
              <button className={btnGhost}>Write off</button>
            </form>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Lines ({s.entries.length})</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-plum-ink/50">
            <tr><th className="py-1">Date</th><th>Order</th><th>Commissionable</th><th>Rate</th><th>Commission</th><th>State</th></tr>
          </thead>
          <tbody className="divide-y divide-plum-ink/5">
            {s.entries.map((e) => (
              <tr key={e.id}>
                <td className="py-1.5">{e.orderedAt ? manilaDate(e.orderedAt) : ""}</td>
                <td>{e.kind === "adjustment" ? `Adjustment — ${e.note ?? ""}` : `${e.orderId ? ref(e.orderId) : ""} ${e.order?.customerName ?? ""}`}</td>
                <td>{e.kind === "order" ? formatPeso(e.commissionableTotal) : "—"}</td>
                <td>{e.kind === "order" ? formatRate(e.rateBps) : "—"}</td>
                <td className="font-semibold">{formatPeso(e.commissionAmount)}</td>
                <td className="capitalize">{e.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
