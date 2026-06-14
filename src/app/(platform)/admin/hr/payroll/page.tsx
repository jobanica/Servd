import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { listEmployees, payrollEntries } from "@/server/hr/queries";
import { computeHours, grossPay } from "@/lib/hr/hours";
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
  const [employees, entries] = await Promise.all([
    listEmployees(restaurantId),
    payrollEntries(restaurantId, from, to),
  ]);

  // Aggregate approved hours per employee.
  const byEmp = new Map<string, { hours: number; ot: number }>();
  for (const e of entries) {
    const h = computeHours(e.clockIn, e.clockOut, e.breakMinutes);
    const cur = byEmp.get(e.employeeId) ?? { hours: 0, ot: 0 };
    byEmp.set(e.employeeId, { hours: cur.hours + h.hours, ot: cur.ot + h.overtime });
  }

  const rows = employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const agg = byEmp.get(e.id) ?? { hours: 0, ot: 0 };
      return { name: e.fullName, payType: e.payType, hours: agg.hours, ot: agg.ot, gross: grossPay(e.payType, e.payRate, agg.hours) };
    });
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
          <h1 className="font-heading text-2xl font-bold">Payroll prep</h1>
          <p className="text-sm text-plum-ink/50">{from.toLocaleDateString()} – {to.toLocaleDateString()}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/hr/payroll?period=this" className={`rounded-full px-3 py-1 text-sm font-semibold ${period === "this" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>This month</Link>
          <Link href="/admin/hr/payroll?period=last" className={`rounded-full px-3 py-1 text-sm font-semibold ${period === "last" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>Last month</Link>
          <a href={`/admin/hr/payroll/export?period=${period}`} className="rounded-full border border-plum-ink/15 px-3 py-1 text-sm font-semibold">Export CSV</a>
        </div>
      </div>

      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
        Payroll prep only — gross = hours × rate (hourly) or flat (monthly). Statutory
        deductions (SSS, PhilHealth, Pag-IBIG, BIR, 13th-month) are NOT applied; configure
        those in your payroll system.
      </p>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr><th className="p-3">Employee</th><th>Type</th><th>Hours</th><th>OT</th><th>Gross</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-plum-ink/10">
                <td className="p-3">{r.name}</td>
                <td>{r.payType}</td>
                <td>{r.hours.toFixed(2)}</td>
                <td>{r.ot > 0 ? r.ot.toFixed(2) : "—"}</td>
                <td className="font-semibold">{formatPeso(r.gross)}</td>
              </tr>
            ))}
            <tr className="border-t border-plum-ink/10 font-heading font-bold">
              <td className="p-3" colSpan={4}>Total</td><td>{formatPeso(totalGross)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
