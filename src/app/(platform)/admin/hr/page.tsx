import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { listEmployees } from "@/server/hr/queries";
import { formatPeso } from "@/lib/money";
import { AddEmployeeForm } from "@/components/admin/hr/AddEmployeeForm";

function UpgradePrompt() {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h1 className="font-heading text-2xl font-bold">HR</h1>
      <p className="mt-2 text-sm text-plum-ink/70">
        HRIS is a premium module.{" "}
        <Link href="/admin/billing" className="font-semibold text-brand-primary">Upgrade your plan</Link>{" "}
        to manage employees, schedules, attendance, leave, and payroll prep.
      </p>
    </div>
  );
}

export default async function HrPage() {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <UpgradePrompt />;
  const employees = await listEmployees(restaurantId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">HR · Employees</h1>
        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ["Schedule", "/admin/hr/schedule"],
            ["Timesheets", "/admin/hr/timesheets"],
            ["Leave", "/admin/hr/leave"],
            ["Payroll", "/admin/hr/payroll"],
          ].map(([l, h]) => (
            <Link key={h} href={h} className="rounded-full border border-plum-ink/15 px-3 py-1 font-semibold">
              {l}
            </Link>
          ))}
        </nav>
      </div>

      <AddEmployeeForm />

      <ul className="space-y-2">
        {employees.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/hr/${e.id}`} className="flex items-center justify-between rounded-tile border border-plum-ink/10 bg-white p-4 hover:border-brand-primary">
              <div>
                <span className="font-medium">{e.fullName}</span>
                {e.status === "inactive" && <span className="ml-2 text-xs text-muted">(inactive)</span>}
                <span className="block text-xs text-plum-ink/40">
                  {e.title ?? "—"} · {e.employmentType.replace("_", "-")}
                </span>
              </div>
              <span className="text-sm text-plum-ink/60">
                {formatPeso(e.payRate)}/{e.payType === "hourly" ? "hr" : "mo"}
              </span>
            </Link>
          </li>
        ))}
        {employees.length === 0 && <p className="text-sm text-plum-ink/40">No employees yet.</p>}
      </ul>
    </div>
  );
}
