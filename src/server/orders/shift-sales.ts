import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { rollupShiftPayments } from "@/lib/orders/shift-rollup";

/**
 * The takings of ONE cashier shift.
 *
 * Separate from getSalesReport, which answers a different question: the
 * accounting report is "what did this restaurant take between two dates" and
 * must include online payments nobody stood at a till for. This is "what is in
 * MY drawer", so it counts only what this shift was stamped with.
 *
 * A payment with no shift — an online order, or anything recorded before shift
 * tracking existed — belongs to no cashier and appears in no Z-report. It still
 * shows in accounting and on the dashboard, where it belongs.
 */

export interface ShiftSales {
  gross: number;
  orderCount: number;
  discounts: number;
  byMethod: { method: string; amount: number; count: number }[];
}

const empty: ShiftSales = { gross: 0, orderCount: 0, discounts: 0, byMethod: [] };

export async function getShiftSales(
  restaurantId: string,
  shiftId: string,
): Promise<ShiftSales> {
  try {
    const payments = await systemDb((tx) =>
      tx.payment.findMany({
        where: { shiftId, status: "paid", order: { restaurantId } },
        select: { amount: true, method: true, orderId: true },
      }),
    );
    if (payments.length === 0) return empty;

    const rolled = rollupShiftPayments(payments);

    // Discounts given on the orders this shift settled (best-effort).
    let discounts = 0;
    try {
      const orders = await systemDb((tx) =>
        tx.order.findMany({
          where: { id: { in: rolled.orderIds }, restaurantId },
          select: { discountAmount: true },
        }),
      );
      discounts = orders.reduce((s, o) => s + (o.discountAmount ?? 0), 0);
    } catch {
      /* column lag */
    }

    return {
      gross: rolled.gross,
      orderCount: rolled.orderCount,
      discounts,
      byMethod: rolled.byMethod,
    };
  } catch {
    // shiftId column not migrated yet — the caller falls back to the day view.
    return empty;
  }
}

/** Cash-outs taken from this shift's drawer. */
export async function getShiftCashOuts(
  restaurantId: string,
  shiftId: string,
): Promise<{ amount: number; note: string | null; at: string }[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.cashMovement.findMany({
        where: { restaurantId, shiftId, type: "cash_out" },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { amount: true, note: true, createdAt: true },
      }),
    );
    return rows.map((r) => ({ amount: r.amount, note: r.note, at: r.createdAt.toISOString() }));
  } catch {
    return [];
  }
}
