import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";

const VAT_RATE = 0.12;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface SalesReport {
  gross: number; // total collected (centavos)
  orderCount: number;
  discounts: number;
  byMethod: { method: string; amount: number; count: number }[];
  byDay: { day: string; amount: number; orders: number }[];
}

/** Sales / Z-report from confirmed payments in a period. */
export async function getSalesReport(restaurantId: string, from: Date, to: Date): Promise<SalesReport> {
  return tenantDb(restaurantId, async (tx) => {
    const payments = await tx.payment.findMany({
      where: { status: "paid", createdAt: { gte: from, lte: to } },
      select: { amount: true, method: true, orderId: true, createdAt: true },
    });

    let gross = 0;
    const orderIds = new Set<string>();
    const methodMap = new Map<string, { amount: number; count: number }>();
    const dayMap = new Map<string, { amount: number; orders: Set<string> }>();
    for (const p of payments) {
      gross += p.amount;
      orderIds.add(p.orderId);
      const m = methodMap.get(p.method) ?? { amount: 0, count: 0 };
      methodMap.set(p.method, { amount: m.amount + p.amount, count: m.count + 1 });
      const dk = dayKey(p.createdAt);
      const d = dayMap.get(dk) ?? { amount: 0, orders: new Set<string>() };
      d.amount += p.amount;
      d.orders.add(p.orderId);
      dayMap.set(dk, d);
    }

    // Discounts on those orders (best-effort — column may lag).
    let discounts = 0;
    try {
      if (orderIds.size) {
        const orders = await tx.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { discountAmount: true },
        });
        discounts = orders.reduce((s, o) => s + (o.discountAmount ?? 0), 0);
      }
    } catch {
      /* not migrated */
    }

    return {
      gross,
      orderCount: orderIds.size,
      discounts,
      byMethod: [...methodMap.entries()].map(([method, v]) => ({ method, ...v })),
      byDay: [...dayMap.entries()]
        .map(([day, v]) => ({ day, amount: v.amount, orders: v.orders.size }))
        .sort((a, b) => (a.day < b.day ? 1 : -1)),
    };
  });
}

export interface VatReport {
  totalSales: number;
  exemptSales: number; // Senior/PWD VAT-exempt
  vatableGross: number; // VAT-inclusive
  netOfVat: number;
  vat: number;
}

/** PH VAT breakdown (12% inclusive) with Senior/PWD exemption. */
export async function getVatReport(restaurantId: string, from: Date, to: Date): Promise<VatReport> {
  return tenantDb(restaurantId, async (tx) => {
    const payments = await tx.payment.findMany({
      where: { status: "paid", createdAt: { gte: from, lte: to } },
      select: { amount: true, orderId: true },
    });
    const total = payments.reduce((s, p) => s + p.amount, 0);

    // Exempt = sales for orders with a Senior/PWD discount label (best-effort).
    let exempt = 0;
    try {
      const ids = [...new Set(payments.map((p) => p.orderId))];
      if (ids.length) {
        const orders = await tx.order.findMany({
          where: { id: { in: ids }, OR: [{ discountLabel: { contains: "Senior" } }, { discountLabel: { contains: "PWD" } }] },
          select: { id: true },
        });
        const exemptIds = new Set(orders.map((o) => o.id));
        exempt = payments.filter((p) => exemptIds.has(p.orderId)).reduce((s, p) => s + p.amount, 0);
      }
    } catch {
      /* not migrated */
    }

    const vatableGross = Math.max(0, total - exempt);
    const netOfVat = Math.round(vatableGross / (1 + VAT_RATE));
    return { totalSales: total, exemptSales: exempt, vatableGross, netOfVat, vat: vatableGross - netOfVat };
  });
}

/**
 * COGS = sum of (menu item food cost × quantity) for items in paid orders.
 * Food cost is set per item in the menu editor. Best-effort (0 if not set).
 */
export async function getCogs(restaurantId: string, from: Date, to: Date): Promise<number> {
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const payments = await tx.payment.findMany({
        where: { status: "paid", createdAt: { gte: from, lte: to } },
        select: { orderId: true },
      });
      const orderIds = [...new Set(payments.map((p) => p.orderId))];
      if (orderIds.length === 0) return 0;
      const [items, costs] = await Promise.all([
        tx.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          select: { menuItemId: true, quantity: true },
        }),
        tx.menuItemCost.findMany({ select: { menuItemId: true, cost: true } }),
      ]);
      const costMap = new Map(costs.map((c) => [c.menuItemId, c.cost]));
      return items.reduce((s, it) => s + (costMap.get(it.menuItemId) ?? 0) * it.quantity, 0);
    });
  } catch {
    return 0;
  }
}

export interface ExpenseRow {
  id: string;
  date: string;
  category: string;
  amount: number;
  note: string | null;
}

export async function getExpenses(restaurantId: string, from: Date, to: Date): Promise<ExpenseRow[]> {
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.expense.findMany({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: "desc" },
        select: { id: true, date: true, category: true, amount: true, note: true },
      }),
    );
    return rows.map((r) => ({ id: r.id, date: r.date.toISOString(), category: r.category, amount: r.amount, note: r.note }));
  } catch {
    return [];
  }
}
