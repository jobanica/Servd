import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import {
  agreementCovers,
  costPerHousehold,
  manilaDate,
  manilaMonth,
  monthPeriod,
  ordersPer100,
  payback,
  PLATFORM_SOURCES,
  previousMonth,
} from "@/lib/neighborhood/commission";

/**
 * Read side of the neighborhood module, for the super-admin screens. All via
 * systemDb: these are the platform's own books.
 */

const EARNING_STATES = ["pending", "confirmed", "disputed", "settled"];
const DAY_MS = 24 * 60 * 60 * 1000;

export const partnerName = (r: { name: string; displayName: string | null }) => r.displayName || r.name;

/** The partner's public ordering page: its verified own domain, else servdph.com/r/<slug>. */
export function orderingUrl(r: { slug: string; customDomain: string | null; customDomainVerifiedAt: Date | null }): string {
  if (r.customDomain && r.customDomainVerifiedAt) return `https://${r.customDomain}`;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.servdph.com").replace(/\/$/, "");
  return `${base}/r/${r.slug}`;
}

export async function listTerritories(now = new Date()) {
  const month = monthPeriod(manilaMonth(now))!;
  const territories = await systemDb((tx) =>
    tx.territory.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        partners: {
          select: {
            id: true,
            status: true,
            category: true,
            startsOn: true,
            endsOn: true,
            restaurantId: true,
            restaurant: { select: { name: true, displayName: true } },
          },
        },
      },
    }),
  );
  const partnerIds = territories.flatMap((t) => t.partners.map((p) => p.id));
  const restaurantIds = [...new Set(territories.flatMap((t) => t.partners.filter((p) => p.status === "active").map((p) => p.restaurantId)))];
  const [commission, orders] = await systemDb((tx) =>
    Promise.all([
      partnerIds.length
        ? tx.commissionEntry.groupBy({
            by: ["territoryPartnerId"],
            where: { territoryPartnerId: { in: partnerIds }, kind: "order", state: { in: EARNING_STATES }, orderedAt: { gte: month.from, lt: month.to } },
            _sum: { commissionAmount: true },
          })
        : Promise.resolve([]),
      restaurantIds.length
        ? tx.order.groupBy({
            by: ["restaurantId"],
            where: { restaurantId: { in: restaurantIds }, source: { in: [...PLATFORM_SOURCES] }, status: "closed", createdAt: { gte: month.from, lt: month.to } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]),
  );
  const commissionBy = new Map(commission.map((c) => [c.territoryPartnerId, c._sum.commissionAmount ?? 0]));
  const ordersBy = new Map(orders.map((o) => [o.restaurantId, o._count._all]));

  return territories.map((t) => {
    const active = t.partners.filter((p) => p.status === "active");
    return {
      id: t.id,
      name: t.name,
      city: t.city,
      province: t.province,
      householdEstimate: t.householdEstimate,
      status: t.status,
      notes: t.notes,
      activePartners: active.map((p) => ({ id: p.id, category: p.category, name: partnerName(p.restaurant) })),
      ordersThisMonth: active.reduce((s, p) => s + (ordersBy.get(p.restaurantId) ?? 0), 0),
      commissionThisMonth: t.partners.reduce((s, p) => s + (commissionBy.get(p.id) ?? 0), 0),
    };
  });
}

export async function listPartners() {
  const rows = await systemDb((tx) =>
    tx.territoryPartner.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        territory: { select: { id: true, name: true } },
        restaurant: { select: { id: true, name: true, displayName: true, slug: true, commercialTrack: true } },
      },
    }),
  );
  return rows.map((r) => ({ ...r, partnerName: partnerName(r.restaurant) }));
}

export async function getPartner(id: string) {
  return systemDb((tx) =>
    tx.territoryPartner.findFirst({
      where: { id },
      include: {
        territory: true,
        restaurant: {
          select: { id: true, name: true, displayName: true, slug: true, commercialTrack: true, customDomain: true, customDomainVerifiedAt: true },
        },
        campaigns: { orderBy: { createdAt: "desc" } },
        statements: { orderBy: { periodStart: "desc" } },
      },
    }),
  );
}

/** Per-partner performance and payback — whether the territory model works. */
export async function partnerPerformance(partnerId: string, now = new Date()) {
  const p = await systemDb((tx) =>
    tx.territoryPartner.findFirst({
      where: { id: partnerId },
      select: {
        restaurantId: true,
        activationFee: true,
        startsOn: true,
        campaigns: { select: { quantity: true, unitCost: true, householdsCovered: true } },
      },
    }),
  );
  if (!p) return null;

  // Six Manila months, oldest first.
  const months: string[] = [];
  let m = manilaMonth(now);
  for (let i = 0; i < 6; i++) {
    months.unshift(m);
    m = previousMonth(m);
  }
  const from = monthPeriod(months[0])!.from;
  const since = new Date(`${p.startsOn.toISOString().slice(0, 10)}T00:00:00+08:00`);

  const [orders, entries, magnetOrders] = await systemDb((tx) =>
    Promise.all([
      tx.order.findMany({
        where: { restaurantId: p.restaurantId, source: { in: [...PLATFORM_SOURCES] }, status: "closed", createdAt: { gte: since < from ? since : from } },
        select: { createdAt: true, total: true, customerPhone: true },
      }),
      tx.commissionEntry.findMany({
        where: { territoryPartnerId: partnerId, state: { in: EARNING_STATES } },
        select: { orderedAt: true, commissionAmount: true, commissionableTotal: true, kind: true },
      }),
      tx.order.count({ where: { restaurantId: p.restaurantId, sourceChannel: "magnet_qr", status: "closed" } }),
    ]),
  );

  const trend = months.map((mo) => {
    const per = monthPeriod(mo)!;
    const os = orders.filter((o) => o.createdAt >= per.from && o.createdAt < per.to);
    const es = entries.filter((e) => e.orderedAt && e.orderedAt >= per.from && e.orderedAt < per.to);
    return {
      month: mo,
      orders: os.length,
      gross: es.filter((e) => e.kind === "order").reduce((s, e) => s + e.commissionableTotal, 0),
      commission: es.reduce((s, e) => s + e.commissionAmount, 0),
    };
  });

  const sinceStart = orders.filter((o) => o.createdAt >= since);
  const phones = new Map<string, number>();
  for (const o of sinceStart) if (o.customerPhone) phones.set(o.customerPhone, (phones.get(o.customerPhone) ?? 0) + 1);
  const customers = phones.size;
  const repeat = [...phones.values()].filter((n) => n >= 2).length;

  const gross = entries.filter((e) => e.kind === "order").reduce((s, e) => s + e.commissionableTotal, 0);
  const commissionEarned = entries.reduce((s, e) => s + e.commissionAmount, 0);
  const orderEntries = entries.filter((e) => e.kind === "order").length;
  const magnets = p.campaigns.reduce((s, c) => s + c.quantity, 0);
  const magnetCost = p.campaigns.reduce((s, c) => s + c.quantity * (c.unitCost ?? 0), 0);

  return {
    trend,
    ordersSinceStart: sinceStart.length,
    gross,
    commissionEarned,
    averageOrder: orderEntries ? Math.round(gross / orderEntries) : 0,
    repeatRate: customers ? Math.round((repeat / customers) * 1000) / 10 : null,
    customers,
    magnets,
    magnetOrders,
    ordersPer100Magnets: ordersPer100(magnetOrders, magnets),
    campaignCosts: p.campaigns.map((c) => costPerHousehold(c)),
    payback: payback(commissionEarned, p.activationFee, magnetCost),
  };
}

/** Every territory with a simple health read: active, producing orders, collecting on time. */
export async function networkHealth(now = new Date()) {
  const today = manilaDate(now);
  const recent = new Date(now.getTime() - 14 * DAY_MS);
  const territories = await systemDb((tx) =>
    tx.territory.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        partners: {
          select: {
            id: true,
            status: true,
            startsOn: true,
            endsOn: true,
            restaurantId: true,
            restaurant: { select: { name: true, displayName: true } },
            statements: { where: { status: { in: ["issued", "partially_paid"] } }, select: { dueAt: true } },
          },
        },
      },
    }),
  );
  const restaurantIds = [...new Set(territories.flatMap((t) => t.partners.map((p) => p.restaurantId)))];
  const recentOrders = restaurantIds.length
    ? await systemDb((tx) =>
        tx.order.groupBy({
          by: ["restaurantId"],
          where: { restaurantId: { in: restaurantIds }, source: { in: [...PLATFORM_SOURCES] }, status: "closed", createdAt: { gte: recent } },
          _count: { _all: true },
        }),
      )
    : [];
  const recentBy = new Map(recentOrders.map((o) => [o.restaurantId, o._count._all]));

  return territories.map((t) => {
    const live = t.partners.filter((p) => agreementCovers(p, now));
    const producing = live.some((p) => (recentBy.get(p.restaurantId) ?? 0) > 0);
    const overdue = live.some((p) => p.statements.some((s) => s.dueAt && s.dueAt.toISOString().slice(0, 10) < today));
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      partners: live.map((p) => partnerName(p.restaurant)),
      active: live.length > 0,
      producing,
      collectingOnTime: live.length > 0 && !overdue,
      orders14d: live.reduce((s, p) => s + (recentBy.get(p.restaurantId) ?? 0), 0),
    };
  });
}

export interface LedgerFilter {
  partnerId?: string;
  state?: string;
  month?: string;
}

export async function listEntries(f: LedgerFilter, take = 300) {
  const period = f.month ? monthPeriod(f.month) : null;
  return systemDb((tx) =>
    tx.commissionEntry.findMany({
      where: {
        ...(f.partnerId ? { territoryPartnerId: f.partnerId } : {}),
        ...(f.state ? { state: f.state } : {}),
        ...(period ? { orderedAt: { gte: period.from, lt: period.to } } : {}),
      },
      orderBy: { orderedAt: "desc" },
      take,
      include: {
        partner: { select: { id: true, restaurant: { select: { name: true, displayName: true } } } },
        statement: { select: { id: true, status: true, periodStart: true } },
        order: { select: { id: true, orderType: true, customerName: true } },
      },
    }),
  );
}

export async function getStatement(id: string) {
  return systemDb((tx) =>
    tx.commissionStatement.findFirst({
      where: { id },
      include: {
        partner: {
          include: {
            territory: { select: { name: true } },
            restaurant: { select: { name: true, displayName: true } },
          },
        },
        entries: {
          orderBy: { orderedAt: "asc" },
          include: { order: { select: { id: true, orderType: true, customerName: true } } },
        },
      },
    }),
  );
}

export async function listStatements() {
  return systemDb((tx) =>
    tx.commissionStatement.findMany({
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: { partner: { select: { id: true, restaurant: { select: { name: true, displayName: true } }, territory: { select: { name: true } } } } },
    }),
  );
}
