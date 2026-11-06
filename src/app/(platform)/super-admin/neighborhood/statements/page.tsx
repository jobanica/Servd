import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { listCommissionPayments, listPartners, listStatements, weekLabel } from "@/server/neighborhood/queries";
import { outstandingStatements } from "@/server/neighborhood/statements";
import { getCommissionPaymentDetails } from "@/server/neighborhood/payment-details";
import { confirmPaymentAction, generateStatementAction, rejectPaymentAction } from "@/server/neighborhood/actions";
import { saveCommissionPaymentDetails } from "@/server/neighborhood/payment-actions";
import { PaymentDetailsForm } from "@/components/super-admin/agents/PaymentDetailsForm";
import { NbChrome, input, label, btn, btnGhost, card } from "@/components/super-admin/neighborhood/NbChrome";
import { formatPeso } from "@/lib/money";
import { agingSummary, daysOverdue, manilaDate, recentSaturdays } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const BACK = "/super-admin/neighborhood/statements";
const BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireSuperAdminPage();
  const flash = await searchParams;
  const today = manilaDate(new Date());
  const [outstanding, statements, partners, payments, payDetails] = await Promise.all([
    outstandingStatements(),
    listStatements(),
    listPartners(),
    listCommissionPayments(),
    getCommissionPaymentDetails(),
  ]);
  const aging = agingSummary(outstanding, today);
  const owed = outstanding.reduce((s, r) => s + r.balance, 0);
  const waiting = payments.filter((p) => p.status === "submitted");
  const decided = payments.filter((p) => p.status !== "submitted").slice(0, 15);
  const saturdays = recentSaturdays(today, 6);

  return (
    <div className="space-y-6">
      <NbChrome
        active="statements"
        title="Statements & payments"
        intro="Weekly: every Saturday just after midnight, each partner's statement for the week before (Saturday to Friday) is built and issued, due that Saturday. Partners pay by your bank QR and upload the receipt; confirm it here."
        flash={flash}
      />

      <section className={card}>
        <h2 className="font-heading font-bold">Payments to confirm ({waiting.length})</h2>
        {waiting.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/50">No receipts waiting.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {waiting.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-4 rounded-lg border border-plum-ink/10 p-3">
                {p.receiptUrl ? (
                  <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.receiptUrl} alt="Payment receipt" className="h-40 w-32 rounded-lg border object-cover" />
                  </a>
                ) : (
                  <span className="flex h-40 w-32 items-center justify-center rounded-lg bg-plum-ink/5 text-xs text-plum-ink/50">Receipt unavailable</span>
                )}
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="font-heading text-lg font-extrabold">{formatPeso(p.amount)}</p>
                  <p>
                    <Link href={`/super-admin/neighborhood/partners/${p.partner.id}`} className="font-semibold text-brand-primary">{p.partnerName}</Link>
                    <span className="text-plum-ink/50"> · {p.partner.territory.name}</span>
                  </p>
                  <p className="text-plum-ink/60">
                    Sent {manilaDate(p.submittedAt)}{p.reference ? ` · ref ${p.reference}` : ""} · owes {formatPeso(p.owed)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <form action={confirmPaymentAction}>
                      <input type="hidden" name="back" value={BACK} />
                      <input type="hidden" name="id" value={p.id} />
                      <button className={btn}>✓ Received — confirm</button>
                    </form>
                    <form action={rejectPaymentAction} className="flex items-center gap-1">
                      <input type="hidden" name="back" value={BACK} />
                      <input type="hidden" name="id" value={p.id} />
                      <input name="reason" required placeholder="Why not (shown to the partner)" className={`${input} w-56`} />
                      <button className={btnGhost}>Reject</button>
                    </form>
                  </div>
                  <p className="text-xs text-plum-ink/45">Confirming applies it to their oldest unpaid weeks; anything extra becomes a credit on the next one.</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {decided.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-plum-ink/60">Recently decided</summary>
            <ul className="mt-2 divide-y divide-plum-ink/5 text-sm">
              {decided.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-3 py-1.5">
                  <span className="font-semibold">{formatPeso(p.amount)}</span>
                  <span>{p.partnerName}</span>
                  <span className="text-plum-ink/50">{manilaDate(p.submittedAt)}</span>
                  <span className={p.status === "confirmed" ? "text-green-700" : "text-guava"}>{p.status}{p.reason ? ` — ${p.reason}` : ""}</span>
                  {p.receiptUrl && <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-primary">Receipt</a>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Collections — {formatPeso(owed)} outstanding</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {BUCKETS.map((b) => (
            <div key={b} className={`rounded-lg p-2 ${b === "current" ? "bg-plum-ink/5" : "bg-guava/10"}`}>
              <p className="text-xs font-semibold text-plum-ink/50">{b === "current" ? "Due today / not yet due" : `${b} days overdue`}</p>
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
                  <span className="text-plum-ink/60">{r.territoryName} · week from {r.periodStart}</span>
                  <span className="ml-auto font-semibold">{formatPeso(r.balance)}</span>
                  <span className={late ? "font-semibold text-guava" : "text-plum-ink/50"}>{late ? `${late} days late` : `due ${r.dueAt}`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Where partners pay (bank QR)</h2>
        <p className="mb-3 text-sm text-plum-ink/55">Shown to neighborhood partners when they tap “Pay commission”. Separate from the agent-portal payment details.</p>
        <PaymentDetailsForm initial={payDetails} save={saveCommissionPaymentDetails} />
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Build a week by hand</h2>
        <p className="text-sm text-plum-ink/55">Normally automatic. Use this to rebuild a draft, or for a week the automatic run missed.</p>
        <form action={generateStatementAction} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="back" value={BACK} />
          <label>
            <span className={label}>Partner</span>
            <select name="partnerId" required className={input}>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.partnerName} · {p.territory.name}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>Billed on Saturday</span>
            <select name="saturday" required className={input} defaultValue={saturdays[0]}>
              {saturdays.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
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
              <tr><th className="py-1">Partner</th><th>Week</th><th>Status</th><th>Orders</th><th>Due</th><th>Paid</th></tr>
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
                  <td>{weekLabel(s.periodStart, s.periodEnd)}</td>
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
