import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getPartnerCommission } from "@/server/neighborhood/partner";
import { LineActions } from "@/components/admin/commission/LineActions";
import { formatPeso } from "@/lib/money";
import { formatRate, manilaDate } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  pending: "Awaiting confirmation",
  confirmed: "Recorded",
  disputed: "Under review",
  waived: "Waived",
  settled: "Settled",
  cancelled: "Cancelled — no commission",
};

/**
 * A neighborhood partner's commission, in the open: every platform order this
 * month with its commission line, what's accruing, and what's owed. Only for
 * accounts on the neighborhood track; any other account gets a 404.
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
            ? `Neighborhood partner — ${data.agreement.territory.name}. ${formatRate(data.rateBps)} of the food subtotal of completed orders placed through your Servd ordering page.`
            : "Your neighborhood partner agreement isn't active right now, so no commission is accruing."}{" "}
          Never on delivery fees, tips, walk-in or phone orders. Cancelled orders aren&apos;t charged.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={`Completed orders (${data.month})`} value={String(data.orderCount)} />
        <Tile label="Food subtotal" value={formatPeso(data.gross)} />
        <Tile label="Commission accruing" value={formatPeso(data.accruing)} />
        <Tile label="Amount due" value={formatPeso(data.owed)} strong={data.owed > 0} />
      </div>

      {data.lastStatement && (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-4 text-sm">
          Last statement: <strong>{data.lastStatement.periodStart.toISOString().slice(0, 7)}</strong> —{" "}
          {formatPeso(data.lastStatement.commissionDue)} ({data.lastStatement.status.replace("_", " ")}
          {data.lastStatement.dueAt ? `, due ${data.lastStatement.dueAt.toISOString().slice(0, 10)}` : ""}
          {data.lastStatement.amountPaid > 0 ? `, paid ${formatPeso(data.lastStatement.amountPaid)}` : ""}).
        </p>
      )}

      <section className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h2 className="font-heading font-bold">This month&apos;s orders</h2>
        <p className="text-xs text-plum-ink/50">
          Something here didn&apos;t actually happen? Tap “Not completed?” and Servd will review it before your statement.
        </p>
        {data.lines.length === 0 ? (
          <p className="mt-3 text-sm text-plum-ink/50">No orders from your ordering page yet this month.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-plum-ink/50">
                <tr>
                  <th className="py-1 pr-3">Order</th>
                  <th className="py-1 pr-3">Food subtotal</th>
                  <th className="py-1 pr-3">Commission</th>
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
          <h2 className="font-heading font-bold">Adjustments</h2>
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

function Tile({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-3">
      <p className="text-xs font-semibold text-plum-ink/50">{label}</p>
      <p className={`font-heading text-xl font-extrabold ${strong ? "text-guava" : ""}`}>{value}</p>
    </div>
  );
}
