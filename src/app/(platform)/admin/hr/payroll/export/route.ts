import { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { hasModule } from "@/server/billing/entitlements";
import { listEmployees, payrollEntries } from "@/server/hr/queries";
import { computeHours, grossPay } from "@/lib/hr/hours";

function cell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await hasModule(user.restaurantId, "hris"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") === "last" ? "last" : "this";
  const now = new Date();
  const m = now.getMonth() - (period === "last" ? 1 : 0);
  const from = new Date(now.getFullYear(), m, 1);
  const to = period === "last" ? new Date(now.getFullYear(), m + 1, 0, 23, 59, 59) : now;

  const [employees, entries] = await Promise.all([
    listEmployees(user.restaurantId),
    payrollEntries(user.restaurantId, from, to),
  ]);

  const byEmp = new Map<string, { hours: number; ot: number }>();
  for (const e of entries) {
    const h = computeHours(e.clockIn, e.clockOut, e.breakMinutes);
    const cur = byEmp.get(e.employeeId) ?? { hours: 0, ot: 0 };
    byEmp.set(e.employeeId, { hours: cur.hours + h.hours, ot: cur.ot + h.overtime });
  }

  const header = ["employee", "pay_type", "hours", "overtime_hours", "gross_php"];
  const rows = employees
    .filter((e) => e.status === "active")
    .map((e) => {
      const agg = byEmp.get(e.id) ?? { hours: 0, ot: 0 };
      const gross = grossPay(e.payType, e.payRate, agg.hours);
      return [e.fullName, e.payType, agg.hours.toFixed(2), agg.ot.toFixed(2), (gross / 100).toFixed(2)];
    });

  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="servd-payroll-${period}.csv"`,
    },
  });
}
