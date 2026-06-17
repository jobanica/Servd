"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { getSalesReport, getExpenses } from "@/server/accounting/queries";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_terminal: "Card",
  online_gcash: "GCash (online)",
  online_card: "Card (online)",
};

export interface ShiftSummary {
  restaurantName: string;
  cashier: string;
  from: string;
  to: string;
  gross: number;
  orderCount: number;
  discounts: number;
  byMethod: { label: string; amount: number; count: number }[];
  expensesTotal: number;
  expenses: { category: string; amount: number; note: string | null }[];
  net: number; // gross − expenses
}

/**
 * End-of-shift / daily Z-report for the logged-in cashier: today's collected
 * sales (by payment method), expenses recorded today, and the net. Built from
 * confirmed payments so it matches the accounting sales report.
 */
export async function getShiftSummary(): Promise<ShiftSummary | null> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return null;
  }

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);

  const [sales, expenses] = await Promise.all([
    getSalesReport(staff.restaurantId, from, to),
    getExpenses(staff.restaurantId, from, to),
  ]);

  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);

  return {
    restaurantName: "",
    cashier: staff.email,
    from: from.toISOString(),
    to: to.toISOString(),
    gross: sales.gross,
    orderCount: sales.orderCount,
    discounts: sales.discounts,
    byMethod: sales.byMethod.map((m) => ({
      label: METHOD_LABEL[m.method] ?? m.method,
      amount: m.amount,
      count: m.count,
    })),
    expensesTotal,
    expenses: expenses.map((e) => ({ category: e.category, amount: e.amount, note: e.note })),
    net: sales.gross - expensesTotal,
  };
}
