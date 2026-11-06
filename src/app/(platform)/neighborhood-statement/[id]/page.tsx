import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { getStatement } from "@/server/neighborhood/queries";
import { formatPeso } from "@/lib/money";
import { formatRate, manilaDate } from "@/lib/neighborhood/commission";
import { PrintButton } from "@/components/super-admin/neighborhood/PrintButton";

export const dynamic = "force-dynamic";

const ref = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

/**
 * The partner-facing statement, as a clean page to print or save as PDF and
 * send over Messenger. Outside the super-admin layout so it prints without the
 * sidebar; founder-only, like the rest of the module.
 */
export default async function StatementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "super" || user.role !== "owner") redirect("/login");
  const { id } = await params;
  const s = await getStatement(id);
  if (!s) notFound();

  const name = s.partner.restaurant.displayName || s.partner.restaurant.name;
  const lines = s.entries.filter((e) => e.state !== "cancelled" && e.state !== "waived");
  const balance = Math.max(0, s.commissionDue - s.amountPaid);

  return (
    <main className="mx-auto max-w-2xl bg-white p-8 text-plum-ink print:p-0">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-heading text-2xl font-extrabold">Commission statement</p>
          <p className="text-sm text-plum-ink/60">Servd Neighborhood Partner Program</p>
        </div>
        <PrintButton />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-plum-ink/50">Partner</p>
          <p className="font-semibold">{name}</p>
          <p>{s.partner.territory.name}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-plum-ink/50">Period</p>
          <p>{s.periodStart.toISOString().slice(0, 10)} to {s.periodEnd.toISOString().slice(0, 10)}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-plum-ink/50">Status</p>
          <p className="capitalize">{s.status === "draft" ? "Draft — not yet issued" : s.status.replace("_", " ")}</p>
          {s.dueAt && <p>Due {s.dueAt.toISOString().slice(0, 10)}</p>}
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="border-b border-plum-ink/20 text-left text-xs text-plum-ink/60">
          <tr><th className="py-1">Date</th><th>Order</th><th className="text-right">Food subtotal</th><th className="text-right">Commission</th></tr>
        </thead>
        <tbody className="divide-y divide-plum-ink/10">
          {lines.map((e) => (
            <tr key={e.id}>
              <td className="py-1">{e.orderedAt ? manilaDate(e.orderedAt) : ""}</td>
              <td>{e.kind === "adjustment" ? `Adjustment: ${e.note ?? ""}` : e.orderId ? ref(e.orderId) : ""}</td>
              <td className="text-right">{e.kind === "order" ? formatPeso(e.commissionableTotal) : "—"}</td>
              <td className="text-right">{formatPeso(e.commissionAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between"><span>Orders</span><span>{s.orderCount}</span></div>
        <div className="flex justify-between"><span>Gross food orders</span><span>{formatPeso(s.grossOrders)}</span></div>
        <div className="flex justify-between font-semibold"><span>Commission due</span><span>{formatPeso(s.commissionDue)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>{formatPeso(s.amountPaid)}</span></div>
        <div className="flex justify-between border-t border-plum-ink/20 pt-1 text-base font-extrabold"><span>Balance</span><span>{formatPeso(balance)}</span></div>
      </div>

      <p className="mt-8 text-xs text-plum-ink/50">
        Commission is {formatRate(s.entries.find((e) => e.kind === "order")?.rateBps ?? s.partner.commissionRateBps)} of the food subtotal of
        completed orders placed through your Servd ordering page — not on delivery fees, tips or service charges, and never on walk-in or phone
        orders. Cancelled orders are not charged. Pay by GCash or bank transfer and send us the reference.
      </p>
    </main>
  );
}
