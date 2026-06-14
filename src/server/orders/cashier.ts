"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { notifyOrdersChanged } from "@/server/realtime/notify";

export interface CashierOrder {
  id: string;
  status: string;
  paymentStatus: string;
  total: number;
  billRequested: boolean;
  createdAt: string;
  itemCount: number;
}

export interface CashierTable {
  tableId: string;
  tableNumber: string;
  orders: CashierOrder[];
  outstanding: number; // sum of unpaid order totals (centavos)
  billRequested: boolean;
}

const OPEN = ["new", "preparing", "done"] as const;

/** Open orders grouped per table, for the cashier. */
export async function getCashierTables(): Promise<CashierTable[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  const orders = await tenantDb(staff.restaurantId, (tx) =>
    tx.order.findMany({
      where: { status: { in: [...OPEN] } },
      orderBy: { createdAt: "asc" },
      include: {
        table: { select: { id: true, tableNumber: true } },
        _count: { select: { items: true } },
      },
    }),
  );

  const byTable = new Map<string, CashierTable>();
  for (const o of orders) {
    const key = o.table.id;
    if (!byTable.has(key)) {
      byTable.set(key, {
        tableId: o.table.id,
        tableNumber: o.table.tableNumber,
        orders: [],
        outstanding: 0,
        billRequested: false,
      });
    }
    const t = byTable.get(key)!;
    t.orders.push({
      id: o.id,
      status: o.status,
      paymentStatus: o.paymentStatus,
      total: o.total,
      billRequested: o.billRequested,
      createdAt: o.createdAt.toISOString(),
      itemCount: o._count.items,
    });
    if (o.paymentStatus !== "paid") t.outstanding += o.total;
    if (o.billRequested) t.billRequested = true;
  }

  return [...byTable.values()];
}

/** Record an in-person payment (cash/card). Marks the order paid + logs it. */
export async function markOrderPaid(
  orderId: string,
  method: "cash" | "card_terminal",
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }

  await tenantDb(staff.restaurantId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId } });
    if (!order) throw new Error("Order not found");
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: "paid", billRequested: false },
    });
    await tx.payment.create({
      data: {
        orderId,
        amount: order.total,
        method,
        gateway: "manual",
        status: "paid",
      },
    });
  });

  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}

/** Close (settle) an order so it leaves the active boards. */
export async function closeOrder(
  orderId: string,
): Promise<{ ok: boolean; tables?: CashierTable[]; error?: string }> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, error: "Not allowed." };
  }
  await tenantDb(staff.restaurantId, (tx) =>
    tx.order.update({
      where: { id: orderId },
      data: { status: "closed", billRequested: false },
    }),
  );
  await notifyOrdersChanged(staff.restaurantId);
  return { ok: true, tables: await getCashierTables() };
}
