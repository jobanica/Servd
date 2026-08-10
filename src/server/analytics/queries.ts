import { Prisma } from "@prisma/client";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Per-restaurant analytics. Everything runs inside ONE tenantDb transaction, so
 * RLS scopes it to the restaurant (defense in depth) and the raw time-bucket
 * queries share the same scope. Revenue = paid orders (online OR cash recorded).
 *
 * NOTE: time buckets are in UTC (per the chosen approach); add a restaurant
 * timezone later if "peak hour" precision matters.
 */

export interface AnalyticsBundle {
  summary: { revenue: number; orders: number; aov: number; avgRating: number | null; ratingCount: number };
  revenueByDay: { day: string; revenue: number }[];
  topItems: { name: string; qty: number; revenue: number }[];
  worstItems: { name: string; qty: number; revenue: number }[];
  paymentMix: { method: string; count: number; amount: number }[];
  peakHours: { hour: number; orders: number }[];
  ratingTrend: { day: string; avg: number; count: number }[];
}

export async function getAnalytics(
  restaurantId: string,
  from: Date,
  to: Date,
): Promise<AnalyticsBundle> {
  return tenantDb(restaurantId, async (tx) => {
    const orders = await tx.order.aggregate({
      where: { paymentStatus: "paid", createdAt: { gte: from, lte: to } },
      _sum: { total: true },
      _count: true,
    });
    const fb = await tx.feedback.aggregate({
      where: { createdAt: { gte: from, lte: to } },
      _avg: { rating: true },
      _count: true,
    });

    const revenue = orders._sum.total ?? 0;
    const orderCount = orders._count;

    const revenueByDay = await tx.$queryRaw<{ day: string; revenue: number }[]>`
      select to_char(date_trunc('day', "createdAt" at time zone 'UTC' at time zone 'Asia/Manila'), 'YYYY-MM-DD') as day,
             sum("total")::float8 as revenue
      from orders
      where "restaurantId" = ${restaurantId}
        and "paymentStatus" = 'paid'
        and "createdAt" between ${from} and ${to}
      group by 1 order by 1`;

    const itemsQuery = (dir: Prisma.Sql) => tx.$queryRaw<
      { name: string; qty: number; revenue: number }[]
    >`
      select oi."nameAtTime" as name,
             sum(oi.quantity)::int as qty,
             sum(oi.quantity * oi."unitPrice")::float8 as revenue
      from order_items oi
      join orders o on o.id = oi."orderId"
      where o."restaurantId" = ${restaurantId}
        and o."paymentStatus" = 'paid'
        and o."createdAt" between ${from} and ${to}
      group by oi."nameAtTime"
      order by qty ${dir}
      limit 5`;
    const topItems = await itemsQuery(Prisma.sql`desc`);
    const worstItems = await itemsQuery(Prisma.sql`asc`);

    const paymentGroups = await tx.payment.groupBy({
      by: ["method"],
      where: { status: "paid", order: { is: { createdAt: { gte: from, lte: to } } } },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const paymentMix = paymentGroups.map((g) => ({
      method: g.method,
      count: g._count._all,
      amount: g._sum.amount ?? 0,
    }));

    const peakHours = await tx.$queryRaw<{ hour: number; orders: number }[]>`
      select extract(hour from "createdAt")::int as hour, count(*)::int as orders
      from orders
      where "restaurantId" = ${restaurantId}
        and "paymentStatus" = 'paid'
        and "createdAt" between ${from} and ${to}
      group by 1 order by 1`;

    const ratingTrend = await tx.$queryRaw<{ day: string; avg: number; count: number }[]>`
      select to_char(date_trunc('day', "createdAt" at time zone 'UTC' at time zone 'Asia/Manila'), 'YYYY-MM-DD') as day,
             avg(rating)::float8 as avg, count(*)::int as count
      from feedback
      where "restaurantId" = ${restaurantId}
        and "createdAt" between ${from} and ${to}
      group by 1 order by 1`;

    return {
      summary: {
        revenue,
        orders: orderCount,
        aov: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
        avgRating: fb._avg.rating ? Number(fb._avg.rating.toFixed(2)) : null,
        ratingCount: fb._count,
      },
      revenueByDay,
      topItems,
      worstItems,
      paymentMix,
      peakHours,
      ratingTrend,
    };
  });
}
