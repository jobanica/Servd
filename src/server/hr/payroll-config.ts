import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";

export interface PayrollConfig {
  sssRate: number;
  philhealthRate: number;
  pagibigRate: number;
  birRate: number;
  thirteenthMonth: boolean;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  sssRate: 0,
  philhealthRate: 0,
  pagibigRate: 0,
  birRate: 0,
  thirteenthMonth: false,
};

/** Statutory deduction settings for a restaurant (best-effort; table may lag). */
export async function getPayrollConfig(restaurantId: string): Promise<PayrollConfig> {
  try {
    const s = await tenantDb(restaurantId, (tx) =>
      tx.payrollSetting.findFirst({
        where: { restaurantId },
        select: {
          sssRate: true,
          philhealthRate: true,
          pagibigRate: true,
          birRate: true,
          thirteenthMonth: true,
        },
      }),
    );
    return s ?? DEFAULT_PAYROLL_CONFIG;
  } catch {
    return DEFAULT_PAYROLL_CONFIG;
  }
}

export interface StatutoryDeductions {
  sss: number;
  philhealth: number;
  pagibig: number;
  bir: number;
  thirteenthAccrual: number;
  total: number; // sss + philhealth + pagibig + bir (deducted from pay)
}

/** Compute statutory deductions (centavos) on a base pay (centavos). */
export function computeStatutory(base: number, cfg: PayrollConfig): StatutoryDeductions {
  const pct = (rate: number) => Math.round((base * rate) / 100);
  const sss = pct(cfg.sssRate);
  const philhealth = pct(cfg.philhealthRate);
  const pagibig = pct(cfg.pagibigRate);
  const taxable = Math.max(0, base - sss - philhealth - pagibig);
  const bir = Math.round((taxable * cfg.birRate) / 100);
  const thirteenthAccrual = cfg.thirteenthMonth ? Math.round(base / 12) : 0;
  return { sss, philhealth, pagibig, bir, thirteenthAccrual, total: sss + philhealth + pagibig + bir };
}
