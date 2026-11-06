import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getPartnerCommission } from "@/server/neighborhood/partner";
import { LineActions } from "@/components/admin/commission/LineActions";
import { PayCommission } from "@/components/admin/commission/PayCommission";
import { formatPeso } from "@/lib/money";
import { addDays, formatRate, manilaDate } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Recorded",
  disputed: "Under review",
  waived: "Waived",
  settled: "Paid",
  cancelled: "Cancelled — no commission",
};

const PAYMENT_LABEL: Record<string, string> = {
  submitted: "Waiting for Servd to confirm",
  confirmed: "Confirmed ✓",
  rejected: "Not accepted",
};

/** "Sat, Nov 14" (any day, not only Saturdays) from "YYYY-MM-DD". */
function saturdayLabel(day: string) {
  return new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
}

/**
 * A neighborhood partner's commission, in the open. Commission is paid weekly,
 * every Saturday, for the week before (Saturday to Friday). Shows what's due,
 * what this week has added, every platform order's commission line, and a
 * Pay button: Servd's bank QR, then the receipt, which Servd confirms.
 * Only for accounts on the neighborhood track; any other account gets a 404.
 */
export default async function CommissionPage() {
  const { restaurantId } = await requireAdminPage();
  const data = await getPartnerCommission(restaurantId);
  if (!data) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Commission</h1>
        <p className="text-sm text-plum-ink/55">
          {data.agreement
            ? `Neighborhood partner — ${data.agreement.territory.name}. ${formatRate(data.rateBps)} of the food subtotal of completed orders placed through your Servd ordering page, paid every Saturday for the week before.`
            : "Your neighborhood partner agreement isn't active right now, so no new commission is being recorded."}{" "}
          Never on delivery fees, tips, walk-in or phone orders. Cancelled orders aren&apos;t charged.
        </p>
      </div>

      <section className={`rounded-tile border p-5 ${data.dueNow > 0 ? "border-guava/30 bg-guava/5" : "border-plum-ink/10 bg-white"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/50">Total commission due</p>
            <p className={`font-heading text-4xl font-extrabold ${data.dueNow > 0 ? "text-guava" : "text-plum-ink"}`}>{formatPeso(data.dueNow)}</p>
            <p className="mt-1 text-sm text-plum-ink/60">
              {data.dueNow > 0
                ? `${data.unpaidWeeks} unpaid week${data.unpaidWeeks === 1 ? "" : "s"}${data.oldestDue ? ` · due since ${saturdayLabel(data.oldestDue.toISOString().slice(0, 10))}` : ""}`
                : "You're all paid up."}
            </p>
            {data.awaitingConfirmation > 0 && (
              <p className="mt-1 text-sm font-semibold text-plum-ink/70">
                {formatPeso(data.awaitingConfirmation)} sent — waiting for Servd to confirm.
              </p>
            )}
          </div>
          <PayCommission amountDue={data.dueNow} details={data.paymentDetails} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label={`This week so far (due ${saturdayLabel(data.nextSaturday)})`} value={formatPeso(data.thisWeek)} sub={`${data.thisWeekOrders} completed order${data.thisWeekOrders === 1 ? "" : "s"}`} />
        <Tile label="Next payment day" value={saturdayLabel(data.nextSaturday)} sub={`For orders ${saturdayLabel(addDays(data.nextSaturday, -7))} – ${saturdayLabel(addDays(data.nextSaturday, -1))}`} />
        <Tile
          label="Last statement"
          value={data.lastStatement ? formatPeso(data.lastStatement.commissionDue) : "—"}
          sub={data.lastStatement ? `${data.lastStatement.dueAt ? `Due ${saturdayLabel(data.lastStatement.dueAt.toISOString().slice(0, 10))}` : ""} · ${data.lastStatement.status.replace("_", " ")}` : "None yet"}
        />
      </div>

      {data.payments.length > 0 && (
        <section className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <h2 className="font-heading font-bold">Your payments</h2>
          <ul className="mt-2 divide-y divide-plum-ink/5 text-sm">
            {data.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                {p.receiptUrl && (
                  <a href={p.receiptUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.receiptUrl} alt="Receipt" className="h-10 w-10 rounded-md border object-cover" />
                  </a>
                )}
                <span className="font-semibold">{formatPeso(p.amount)}</span>
                <span className="text-plum-ink/50">{manilaDate(p.submittedAt)}{p.reference ? ` · ref ${p.reference}` : ""}</span>
                <span className={`ml-auto text-xs font-semibold ${p.status === "confirmed" ? "text-green-700" : p.status === "rejected" ? "text-guava" : "text-plum-ink/60"}`}>
                  {PAYMENT_LABEL[p.status] ?? p.status}
                </span>
                {p.status === "rejected" && p.reason && <p className="w-full text-xs text-guava">Reason: {p.reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h2 className="font-heading font-bold">Orders and their commission (last 4 weeks)</h2>
        <p className="text-xs text-plum-ink/50">
          Something here didn&apos;t actually happen? Tap “Not completed?” and Servd will review it before it&apos;s billed.
        </p>
        {data.lines.length === 0 ? (
          <p className="mt-3 text-sm text-plum-ink/50">No orders from your ordering page yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-plum-ink/50">
                <tr>
                  <th className="py-1 pr-3">Order</th>
                  <th className="py-1 pr-3">Food subtotal</th>
                  <th className="py-1 pr-3">Commission</th>
                  <th className="py-1 pr-3">Billed</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-plum-ink/5">
                {data.lines.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 pr-3">
                      <span className="font-semibold">#{l.id.slice(0, 8).toUpperCase()}</span>
                      <p className="text-xs text-plum-ink/50">
                        {manilaDate(l.createdAt)} · {l.orderType}{l.customerName ? ` · ${l.customerName}` : ""}
                      </p>
                    </td>
                    <td className="py-2 pr-3">{formatPeso(l.commissionable)}</td>
                    <td className="py-2 pr-3 font-semibold">{formatPeso(l.commission)}</td>
                    <td className="py-2 pr-3 text-xs text-plum-ink/60">{saturdayLabel(l.billedOn)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {l.entry
                        ? STATE_LABEL[l.entry.state] ?? l.entry.state
                        : l.status === "cancelled"
                          ? "Cancelled — no commission"
                          : l.status === "closed"
                            ? "Completed — recorded within 15 minutes"
                            : "In progress — charged only if completed"}
                      {l.entry?.disputeNote && <p className="text-guava">{l.entry.disputeNote}</p>}
                    </td>
                    <td className="py-2">
                      {l.entry?.open && (l.entry.state === "pending" || l.entry.state === "confirmed") && (
                        <LineActions entryId={l.entry.id} state={l.entry.state} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.adjustments.length > 0 && (
        <section className="rounded-tile border border-plum-ink/10 bg-white p-4 text-sm">
          <h2 className="font-heading font-bold">Adjustments on your next statement</h2>
          <ul className="mt-2 space-y-1">
            {data.adjustments.map((a) => (
              <li key={a.id}>
                {formatPeso(a.commissionAmount)} — {a.note}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-3">
      <p className="text-xs font-semibold text-plum-ink/50">{label}</p>
      <p className="font-heading text-xl font-extrabold">{value}</p>
      {sub && <p className="text-xs text-plum-ink/50">{sub}</p>}
    </div>
  );
}
