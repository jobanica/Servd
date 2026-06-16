import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHrPage } from "@/server/hr/guard";
import { getPayslip } from "@/server/hr/payroll";
import { formatPeso } from "@/lib/money";

function monthRange(which: "this" | "last") {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() - (which === "last" ? 1 : 0);
  const from = new Date(y, m, 1);
  const to = which === "last" ? new Date(y, m + 1, 0, 23, 59, 59) : now;
  return { from, to };
}

function time(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;

  const { employeeId } = await params;
  const period = (await searchParams).period === "last" ? "last" : "this";
  const { from, to } = monthRange(period);
  const slip = await getPayslip(restaurantId, employeeId, from, to);
  if (!slip) notFound();
  const { row, days } = slip;
  const totalDed =
    row.absenceDeduction + row.lateDeduction + row.sss + row.philhealth + row.pagibig + row.bir;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/hr/payroll?period=${period}`} className="text-sm text-plum-ink/50">← Payroll</Link>
        <h1 className="font-heading text-2xl font-bold">{row.name} — payslip</h1>
        <p className="text-sm text-plum-ink/50">{from.toLocaleDateString()} – {to.toLocaleDateString()}</p>
      </div>

      {/* Summary */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-plum-ink/60">{row.payType === "monthly" ? "Monthly salary" : `Hours (${row.hours})`}</dt><dd className="font-semibold">{formatPeso(row.base)}</dd></div>
          {row.payType === "monthly" && (
            <>
              <div className="flex justify-between"><dt className="text-plum-ink/60">Absences ({row.absentDays} day{row.absentDays === 1 ? "" : "s"})</dt><dd className="text-guava">−{formatPeso(row.absenceDeduction)}</dd></div>
              <div className="flex justify-between"><dt className="text-plum-ink/60">Late ({row.lateMinutes} min)</dt><dd className="text-guava">−{formatPeso(row.lateDeduction)}</dd></div>
            </>
          )}
          {row.sss > 0 && <div className="flex justify-between"><dt className="text-plum-ink/60">SSS</dt><dd className="text-guava">−{formatPeso(row.sss)}</dd></div>}
          {row.philhealth > 0 && <div className="flex justify-between"><dt className="text-plum-ink/60">PhilHealth</dt><dd className="text-guava">−{formatPeso(row.philhealth)}</dd></div>}
          {row.pagibig > 0 && <div className="flex justify-between"><dt className="text-plum-ink/60">Pag-IBIG</dt><dd className="text-guava">−{formatPeso(row.pagibig)}</dd></div>}
          {row.bir > 0 && <div className="flex justify-between"><dt className="text-plum-ink/60">BIR withholding</dt><dd className="text-guava">−{formatPeso(row.bir)}</dd></div>}
          <div className="flex justify-between border-t border-plum-ink/10 pt-2"><dt className="text-plum-ink/60">Total deductions</dt><dd className="text-guava">−{formatPeso(totalDed)}</dd></div>
          <div className="flex justify-between font-heading text-lg font-bold"><dt>Net pay</dt><dd>{formatPeso(row.net)}</dd></div>
          {row.thirteenthAccrual > 0 && (
            <div className="flex justify-between border-t border-plum-ink/10 pt-2 text-plum-ink/50"><dt>13th-month accrual (this period)</dt><dd>{formatPeso(row.thirteenthAccrual)}</dd></div>
          )}
        </dl>
      </div>

      {/* Daily breakdown */}
      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr><th className="p-3">Date</th><th>Scheduled start</th><th>Clocked in</th><th className="text-right">Hours</th><th className="text-right">Status</th></tr>
          </thead>
          <tbody>
            {days.length === 0 && (
              <tr><td className="p-3 text-plum-ink/50" colSpan={5}>No shifts or attendance in this period.</td></tr>
            )}
            {days.map((d) => (
              <tr key={d.date} className="border-t border-plum-ink/10">
                <td className="p-3">{new Date(d.date).toLocaleDateString()}</td>
                <td>{time(d.shiftStart)}</td>
                <td>{time(d.clockIn)}</td>
                <td className="text-right">{d.hours > 0 ? d.hours : "—"}</td>
                <td className="text-right">
                  {d.absent ? <span className="text-guava">Absent</span>
                    : d.lateMinutes > 0 ? <span className="text-guava">Late {d.lateMinutes}m</span>
                    : d.clockIn ? <span className="text-mango">Present</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
