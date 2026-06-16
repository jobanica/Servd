"use client";

import { useActionState } from "react";
import { updatePayrollConfig, type PayrollCfgState } from "@/server/hr/payroll-config-actions";
import { SubmitButton } from "@/components/admin/SubmitButton";

export function PayrollSettingsForm({
  initial,
}: {
  initial: {
    sssRate: number;
    philhealthRate: number;
    pagibigRate: number;
    birRate: number;
    thirteenthMonth: boolean;
  };
}) {
  const [state, action] = useActionState<PayrollCfgState, FormData>(updatePayrollConfig, null);

  const field = (name: keyof typeof initial, label: string) => (
    <div>
      <label className="block text-sm font-semibold">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          name={name}
          type="number"
          step="0.01"
          min={0}
          defaultValue={initial[name] as number}
          className="w-28 rounded-lg border border-plum-ink/15 px-3 py-2"
        />
        <span className="text-sm text-plum-ink/50">% of base</span>
      </div>
    </div>
  );

  return (
    <form action={action} className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("sssRate", "SSS")}
        {field("philhealthRate", "PhilHealth")}
        {field("pagibigRate", "Pag-IBIG")}
        {field("birRate", "BIR withholding")}
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="thirteenthMonth" defaultChecked={initial.thirteenthMonth} />
        Accrue 13th-month pay (1/12 of base, shown as an accrual)
      </label>

      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
        Rates are a % of base pay (employee share). BIR is applied to pay after SSS/PhilHealth/
        Pag-IBIG. These are simplified flat rates — adjust to match the current PH contribution
        tables for your salary brackets.
      </p>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save deduction settings</SubmitButton>
    </form>
  );
}
