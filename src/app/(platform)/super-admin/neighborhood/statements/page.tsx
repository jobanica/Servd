import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { listPartners, listStatements } from "@/server/neighborhood/queries";
import { outstandingStatements } from "@/server/neighborhood/statements";
import { generateStatementAction } from "@/server/neighborhood/actions";
import { NbChrome, input, label, btn, card } from "@/components/super-admin/neighborhood/NbChrome";
import { formatPeso } from "@/lib/money";
import { agingSummary, daysOverdue, manilaDate, manilaMonth, previousMonth } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const BACK = "/super-admin/neighborhood/statements";
const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperAdminPage();
  const flash = await searchParams;
  const today = manilaDate(new Date());
  const [outstanding, statements, partners] = await Promise.all([outstandingStatements(), listStatements(), listPartners()]);
  const aging = agingSummary(outstanding, today);
  const owed = outstanding.reduce((s, r) => s + r.balance, 0);
  const lastMonth = previousMonth(manilaMonth());

  return (
    <div className="space-y-6">
      <NbChrome
        active="statements"
        title="Statements & aging"
        intro="Monthly statements per partner. A draft is built on the 1st for the month before (or by hand), reviewed, then issued — after which it never changes. Payments can be partial."
        flash={flash}
      />

      <section className={card}>
        <h2 className="font-heading font-bold">Collections — {formatPeso(owed)} outstanding</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {BUCKETS.map((b) => (
            <div key={b} className={`rounded-lg p-2 ${b === "current" ? "bg-plum-ink/5" : "bg-guava/10"}`}>
              <p className="text-xs font-semibold text-plum-ink/50">{b === "current" ? "Not yet due" : `${b} days overdue`}</p>
              <p className="font-heading text-lg font-extrabold">{formatPeso(aging[b])}</p>
            </div>
          ))}
        </div>
        {outstanding.length > 0 && (
          <ul className="mt-3 divide-y divide-plum-ink/5 text-sm">
            {outstanding.map((r) => {
              const late = daysOverdue(r.dueAt, today);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-1.5">
                  <Link href={`${BACK}/${r.id}`} className="font-semibold text-brand-primary">{r.partnerName}</Link>
                  <span className="text-plum-ink/60">{r.territoryName} · {r.periodStart.slice(0, 7)}</span>
                  <span className="ml-auto font-semibold">{formatPeso(r.balance)}</span>
                  <span className={late ? "font-semibold text-guava" : "text-plum-ink/50"}>{late ? `${late} days late` : `due ${r.dueAt}`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Build a draft</h2>
        <form action={generateStatementAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="back" value={BACK} />
          <label>
            <span className={label}>Partner</span>
            <select name="partnerId" required className={input}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partnerName} · {p.territory.name}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>Month</span>
            <input name="month" type="month" required defaultValue={lastMonth} className={input} />
          </label>
          <button className={btn}>Build draft</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">All statements</h2>
        {statements.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">None yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-plum-ink/50">
              <tr><th className="py-1">Partner</th><th>Month</th><th>Status</th><th>Orders</th><th>Due</th><th>Paid</th></tr>
            </thead>
            <tbody className="divide-y divide-plum-ink/5">
              {statements.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">
                    <Link href={`${BACK}/${s.id}`} className="font-semibold text-brand-primary">
                      {s.partner.restaurant.displayName || s.partner.restaurant.name}
                    </Link>
                    <span className="text-xs text-plum-ink/50"> · {s.partner.territory.name}</span>
                  </td>
                  <td>{s.periodStart.toISOString().slice(0, 7)}</td>
                  <td className="capitalize">{s.status.replace("_", " ")}</td>
                  <td>{s.orderCount}</td>
                  <td className="font-semibold">{formatPeso(s.commissionDue)}</td>
                  <td>{formatPeso(s.amountPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
