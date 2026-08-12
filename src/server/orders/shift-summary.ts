"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getSalesReport, getExpenses } from "@/server/accounting/queries";
import { getCashOutsToday } from "@/server/orders/cash-out";
import { manilaStartOfDay, manilaEndOfDay } from "@/lib/time/manila";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_terminal: "Card",
  gcash: "GCash",
  maya: "Maya",
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
  cashOutTotal: number;
  cashOuts: { amount: number; note: string | null; at: string }[];
  cashCollected: number; // cash payments today
  expectedCash: number; // cash collected − cash-outs (what should be in the drawer)
  net: number; // gross − expenses
}

/**
 * The restaurant's name and a human name for the cashier, for the printed
 * header. Falls back through displayName → username → email, because a DIY
 * account's login address is synthetic (`slug@staff.servdph.com`) and printing
 * that on a Z-report the owner signs is just noise.
 */
async function identify(
  restaurantId: string,
  staffUserId: string,
): Promise<{ restaurantName: string; cashier: string }> {
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const [r, s] = await Promise.all([
        tx.restaurant.findFirstOrThrow({ select: { name: true, displayName: true } }),
        tx.staffUser.findFirst({
          where: { id: staffUserId },
          select: { displayName: true, username: true, email: true },
        }),
      ]);
      return {
        restaurantName: r.displayName || r.name,
        cashier: s?.displayName || s?.username || s?.email?.split("@")[0] || "—",
      };
    });
  } catch {
    return { restaurantName: "", cashier: "—" };
  }
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

  const from = manilaStartOfDay();
  const to = manilaEndOfDay();

  const [sales, expenses, cashOuts, who] = await Promise.all([
    getSalesReport(staff.restaurantId, from, to),
    getExpenses(staff.restaurantId, from, to),
    getCashOutsToday(staff.restaurantId),
    identify(staff.restaurantId, staff.staffUserId),
  ]);

  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const cashOutTotal = cashOuts.reduce((s, c) => s + c.amount, 0);
  const cashCollected = sales.byMethod.find((m) => m.method === "cash")?.amount ?? 0;

  return {
    restaurantName: who.restaurantName,
    cashier: who.cashier,
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
    cashOutTotal,
    cashOuts: cashOuts.map((c) => ({ amount: c.amount, note: c.note, at: c.createdAt })),
    cashCollected,
    expectedCash: Math.max(0, cashCollected - cashOutTotal),
    net: sales.gross - expensesTotal,
  };
}
