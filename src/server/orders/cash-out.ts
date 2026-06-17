"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { pesosToCentavos } from "@/lib/money";

export type CashOutState = { ok?: boolean; message?: string; error?: string } | null;

export interface CashOutRow {
  id: string;
  amount: number;
  note: string | null;
  staffEmail: string | null;
  createdAt: string;
}

/** Today's cash-outs for a restaurant (systemDb + explicit id, RLS-proof). */
export async function getCashOutsToday(restaurantId: string): Promise<CashOutRow[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  try {
    const rows = await systemDb((tx) =>
      tx.cashMovement.findMany({
        where: { restaurantId, type: "cash_out", createdAt: { gte: startOfDay } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, amount: true, note: true, staffEmail: true, createdAt: true },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      note: r.note,
      staffEmail: r.staffEmail,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Today's cash-outs for the logged-in cashier (for the modal list). */
export async function getCashOuts(): Promise<CashOutRow[]> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return [];
  }
  return getCashOutsToday(staff.restaurantId);
}

/** Record cash removed from the drawer (e.g. the owner taking money). */
export async function recordCashOut(_prev: CashOutState, formData: FormData): Promise<CashOutState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { error: "Not allowed." };
  }
  const pesos = Number(formData.get("amount") ?? 0);
  if (!Number.isFinite(pesos) || pesos <= 0) return { error: "Enter an amount." };
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    await systemDb((tx) =>
      tx.cashMovement.create({
        data: {
          restaurantId: staff.restaurantId,
          type: "cash_out",
          amount: pesosToCentavos(pesos),
          note,
          staffEmail: staff.email,
        },
      }),
    );
  } catch {
    return { error: "Couldn't record the cash-out. Run the migration if you haven't yet." };
  }
  return { ok: true, message: "Cash-out recorded." };
}
