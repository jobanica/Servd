"use server";

import { revalidatePath } from "next/cache";
import { requireHrAction } from "@/server/hr/guard";
import { tenantDb } from "@/server/tenancy/scoped-db";

export type PayrollCfgState = { ok?: boolean; error?: string } | null;

export async function updatePayrollConfig(
  _prev: PayrollCfgState,
  formData: FormData,
): Promise<PayrollCfgState> {
  const { restaurantId } = await requireHrAction();
  const num = (k: string) => Math.max(0, Number(formData.get(k)) || 0);
  const data = {
    sssRate: num("sssRate"),
    philhealthRate: num("philhealthRate"),
    pagibigRate: num("pagibigRate"),
    birRate: num("birRate"),
    thirteenthMonth: formData.get("thirteenthMonth") === "on",
  };
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.payrollSetting.upsert({
        where: { restaurantId },
        create: { restaurantId, ...data },
        update: data,
      }),
    );
  } catch (e) {
    const msg = String(e);
    return {
      error: /payroll_setting|column|relation|table/i.test(msg)
        ? "Payroll settings need a quick database update. Run the migration, then try again."
        : "Couldn't save settings.",
    };
  }
  revalidatePath("/admin/hr/payroll/settings");
  revalidatePath("/admin/hr/payroll");
  return { ok: true };
}
