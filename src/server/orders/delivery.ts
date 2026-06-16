"use server";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";

export interface DeliveryOrder {
  id: string;
  status: string;
  paymentStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  lat: number | null;
  lng: number | null;
  total: number;
  itemCount: number;
  items: { name: string; quantity: number }[];
  createdAt: string;
}

const ACTIVE = ["pending", "new", "preparing", "done"] as const;

/** All active delivery orders (for the cashier's delivery view). */
export async function getDeliveryOrders(): Promise<DeliveryOrder[]> {
  const staff = await requireStaff(["cashier", "admin"]);
  const baseSelect = {
    id: true,
    status: true,
    paymentStatus: true,
    total: true,
    createdAt: true,
    customerName: true,
    customerPhone: true,
    customerAddress: true,
    items: { select: { nameAtTime: true, quantity: true } },
  } as const;

  type Row = {
    id: string;
    status: string;
    paymentStatus: string;
    total: number;
    createdAt: Date;
    customerName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    customerLat?: number | null;
    customerLng?: number | null;
    items: { nameAtTime: string; quantity: number }[];
  };

  let rows: Row[];
  try {
    rows = await tenantDb(staff.restaurantId, (tx) =>
      tx.order.findMany({
        where: { orderType: "delivery", status: { in: [...ACTIVE] } },
        orderBy: { createdAt: "desc" },
        select: { ...baseSelect, customerLat: true, customerLng: true },
      }),
    );
  } catch {
    try {
      rows = await tenantDb(staff.restaurantId, (tx) =>
        tx.order.findMany({
          where: { orderType: "delivery", status: { in: [...ACTIVE] } },
          orderBy: { createdAt: "desc" },
          select: baseSelect,
        }),
      );
    } catch {
      return [];
    }
  }

  return rows.map((o) => ({
    id: o.id,
    status: o.status,
    paymentStatus: o.paymentStatus,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerAddress: o.customerAddress,
    lat: o.customerLat ?? null,
    lng: o.customerLng ?? null,
    total: o.total,
    itemCount: o.items.length,
    items: o.items.map((i) => ({ name: i.nameAtTime, quantity: i.quantity })),
    createdAt: o.createdAt.toISOString(),
  }));
}
