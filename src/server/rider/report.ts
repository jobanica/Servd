import "server-only";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { signRiderReceipts } from "@/server/storage/rider-receipts";
import { summarizeByRider, summarizeDeliveries, type DaySummary } from "@/lib/rider/rider";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RiderReportRow {
  id: string;
  ref: string;
  customerName: string | null;
  deliveredAt: string;
  method: string;
  collected: number;
  receiptUrl: string | null;
}

export interface RiderReport {
  total: DaySummary;
  riders: { riderId: string; name: string; summary: DaySummary; rows: RiderReportRow[] }[];
  onTheWay: { id: string; ref: string; customerName: string | null; riderName: string; since: string | null }[];
}

/** One day's deliveries for the owner: per rider, what they delivered and collected. */
export async function getRiderReport(restaurantId: string, dayStart: Date): Promise<RiderReport> {
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const [rows, out, staff] = await tenantDb(restaurantId, (tx) =>
    Promise.all([
      tx.order.findMany({
        where: { riderId: { not: null }, deliveredAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { deliveredAt: "asc" },
        select: {
          id: true,
          customerName: true,
          deliveredAt: true,
          riderId: true,
          riderPayMethod: true,
          riderCollected: true,
          riderReceiptPath: true,
        },
      }),
      tx.order.findMany({
        where: { riderId: { not: null }, deliveryStatus: "out_for_delivery", status: { in: ["new", "preparing", "done"] } },
        orderBy: { riderPickedUpAt: "asc" },
        select: { id: true, customerName: true, riderId: true, riderPickedUpAt: true },
      }),
      tx.staffUser.findMany({ select: { id: true, displayName: true, email: true } }),
    ]),
  );
  const names = new Map(staff.map((s) => [s.id, s.displayName?.trim() || s.email.split("@")[0]]));
  const signed = await signRiderReceipts(restaurantId, rows.map((r) => r.riderReceiptPath));
  const ref = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

  return {
    total: summarizeDeliveries(rows),
    riders: summarizeByRider(rows).map((g) => ({
      riderId: g.riderId,
      name: names.get(g.riderId) ?? "Removed staff",
      summary: g.summary,
      rows: g.rows.map((r) => ({
        id: r.id,
        ref: ref(r.id),
        customerName: r.customerName,
        deliveredAt: (r.deliveredAt ?? dayStart).toISOString(),
        method: r.riderPayMethod ?? "prepaid",
        collected: r.riderCollected ?? 0,
        receiptUrl: r.riderReceiptPath ? signed.get(r.riderReceiptPath) ?? null : null,
      })),
    })),
    onTheWay: out.map((o) => ({
      id: o.id,
      ref: ref(o.id),
      customerName: o.customerName,
      riderName: (o.riderId && names.get(o.riderId)) || "Rider",
      since: o.riderPickedUpAt?.toISOString() ?? null,
    })),
  };
}
