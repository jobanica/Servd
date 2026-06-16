import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { getPayroll } from "@/server/hr/payroll";
import { formatPeso } from "@/lib/money";

function monthRange(which: "this" | "last") {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() - (which === "last" ? 1 : 0);
  const from = new Date(y, m, 1);
  const to = which === "last" ? new Date(y, m + 1, 0, 23, 59, 59) : now;
  return { from, to };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;

  const period = (await searchParams).period === "last" ? "last" : "this";
  const { from, to } = monthRange(period);
  const rows = await getPayroll(restaurantId, from, to);
  const totals = rows.reduce(
    (s, r) => ({
      ded: s.ded + r.absenceDeduction + r.lateDeduction,
      net: s.net + r.net,
    }),
    { ded: 0, net: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
          <h1 className="font-heading text-2xl font-bold">Payroll</h1>
          <p className="text-sm text-plum-ink/50">{from.toLocaleDateString()} – {to.toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/hr/payroll?period=this" className={`rounded-full px-3 py-1 text-sm font-semibold ${period === "this" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>This month</Link>
          <Link href="/admin/hr/payroll?period=last" className={`rounded-full px-3 py-1 text-sm font-semibold ${period === "last" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>Last month</Link>
          <a href={`/admin/hr/payroll/export?period=${period}`} className="rounded-full border border-plum-ink/15 px-3 py-1 text-sm font-semibold">Export CSV</a>
        </div>
      </div>

      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
        Fixed-salary employees: net = monthly salary − absent days − late (pro-rated from a{" "}
        {26}-day month, 8h/day). Hourly = rate × hours. Statutory deductions (SSS, PhilHealth,
        Pag-IBIG, BIR, 13th-month) are NOT applied.
      </p>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr>
              <th className="p-3">Employee</th><th>Type</th><th className="text-right">Base</th>
              <th className="text-right">Absent</th><th className="text-right">Late</th>
              <th className="text-right">Deductions</th><th className="text-right">Net pay</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-t border-plum-ink/10">
                <td className="p-3 font-medium">{r.name}</td>
                <td>{r.payType}</td>
                <td className="text-right">{formatPeso(r.base)}</td>
                <td className="text-right">{r.absentDays > 0 ? `${r.absentDays}d` : "—"}</td>
                <td className="text-right">{r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—"}</td>
                <td className="text-right text-guava">
                  {r.absenceDeduction + r.lateDeduction > 0 ? `−${formatPeso(r.absenceDeduction + r.lateDeduction)}` : "—"}
                </td>
                <td className="text-right font-semibold">{formatPeso(r.net)}</td>
                <td className="pr-3 text-right">
                  <Link href={`/admin/hr/payroll/${r.employeeId}?period=${period}`} className="text-xs font-semibold text-brand-primary">Payslip</Link>
                </td>
              </tr>
            ))}
            <tr className="border-t border-plum-ink/10 font-heading font-bold">
              <td className="p-3" colSpan={5}>Total</td>
              <td className="text-right text-guava">−{formatPeso(totals.ded)}</td>
              <td className="text-right">{formatPeso(totals.net)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
