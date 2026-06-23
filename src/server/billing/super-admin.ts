import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import {
  asTier,
  defaultFeaturesForTier,
  sanitizeFeatures,
  type Feature,
} from "@/lib/billing/features";

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  businessAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  ownerLogin: string | null; // username (preferred) or email of the admin
  createdAt: Date;
}

/** All businesses for the super-admin, newest first (location + owner login). */
export async function listBusinesses(limit = 100): Promise<BusinessRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          businessAddress: true,
          latitude: true,
          longitude: true,
          createdAt: true,
          staff: {
            where: { role: "admin" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { username: true, email: true },
          },
        },
      }),
    );
    return rows.map((r) => {
      const owner = r.staff[0];
      return {
        id: r.id,
        name: r.displayName || r.name,
        slug: r.slug,
        status: r.status,
        businessAddress: r.businessAddress,
        latitude: r.latitude,
        longitude: r.longitude,
        ownerLogin: owner ? owner.username || owner.email : null,
        createdAt: r.createdAt,
      };
    });
  } catch {
    return []; // columns not migrated yet
  }
}

/**
 * Cross-tenant subscription data for the platform back office. Everything runs
 * through systemDb (bypasses tenant RLS) because the super-admin owns the whole
 * platform — there is no single tenant to scope to.
 */

export type SubStatus = "trialing" | "active" | "past_due" | "cancelled";

export interface SubscriptionRow {
  restaurantId: string;
  restaurantName: string;
  slug: string;
  restaurantStatus: string;
  createdAt: string;
  subscriptionId: string | null;
  planId: string | null;
  planName: string | null;
  priceMonthly: number; // centavos
  status: SubStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  failedCharges: number;
  hasSavedCard: boolean;
  smsCreditBalance: number;
  smsSenderName: string | null;
}

/** Every restaurant with its current (latest) subscription + plan. */
export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const restaurants = await systemDb((tx) =>
    tx.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        smsCreditBalance: true,
        smsSenderName: true,
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            planId: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            failedCharges: true,
            providerPaymentMethodId: true,
            plan: { select: { name: true, priceMonthly: true } },
          },
        },
      },
    }),
  );

  return restaurants.map((r) => {
    const sub = r.subscriptions[0];
    return {
      restaurantId: r.id,
      restaurantName: r.name,
      slug: r.slug,
      restaurantStatus: r.status,
      createdAt: r.createdAt.toISOString(),
      subscriptionId: sub?.id ?? null,
      planId: sub?.planId ?? null,
      planName: sub?.plan.name ?? null,
      priceMonthly: sub?.plan.priceMonthly ?? 0,
      status: (sub?.status ?? null) as SubStatus | null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      failedCharges: sub?.failedCharges ?? 0,
      hasSavedCard: !!sub?.providerPaymentMethodId,
      smsCreditBalance: r.smsCreditBalance,
      smsSenderName: r.smsSenderName,
    };
  });
}

export interface SubscriptionMetrics {
  mrr: number; // centavos — active subs only
  mrrWithTrials: number; // centavos — active + trialing
  arr: number; // centavos — mrr × 12
  total: number;
  active: number;
  trialing: number;
  pastDue: number;
  cancelled: number;
  suspended: number;
  trialsEndingSoon: number; // within 7 days
}

/** Headline subscription metrics for the overview dashboard. */
export async function getSubscriptionMetrics(): Promise<SubscriptionMetrics> {
  const rows = await listSubscriptions();
  const now = Date.now();
  const soon = now + 7 * 24 * 60 * 60 * 1000;

  const m: SubscriptionMetrics = {
    mrr: 0,
    mrrWithTrials: 0,
    arr: 0,
    total: rows.length,
    active: 0,
    trialing: 0,
    pastDue: 0,
    cancelled: 0,
    suspended: 0,
    trialsEndingSoon: 0,
  };

  for (const r of rows) {
    if (r.restaurantStatus === "suspended") m.suspended++;
    switch (r.status) {
      case "active":
        m.active++;
        m.mrr += r.priceMonthly;
        m.mrrWithTrials += r.priceMonthly;
        break;
      case "trialing":
        m.trialing++;
        m.mrrWithTrials += r.priceMonthly;
        if (r.trialEndsAt && new Date(r.trialEndsAt).getTime() <= soon) m.trialsEndingSoon++;
        break;
      case "past_due":
        m.pastDue++;
        break;
      case "cancelled":
        m.cancelled++;
        break;
    }
  }
  m.arr = m.mrr * 12;
  return m;
}

export interface PlanRow {
  id: string;
  name: string;
  priceMonthly: number;
  trialDays: number;
  isActive: boolean;
  limits: { maxTables?: number; maxStaff?: number; smsIncluded?: number };
  modules: string[];
  features: Feature[]; // gateable features this plan grants
  subscriberCount: number;
}

const PLAN_SELECT = {
  id: true,
  name: true,
  priceMonthly: true,
  trialDays: true,
  isActive: true,
  limits: true,
  modules: { where: { enabled: true }, select: { module: true } },
  _count: { select: { subscriptions: true } },
} as const;

/** All plans (active + inactive) with subscriber counts, for the plans page. */
export async function listAllPlans(): Promise<PlanRow[]> {
  // Try with the per-plan features column; fall back to tier defaults if the
  // migration hasn't run yet so the plans page keeps working.
  try {
    const plans = await systemDb((tx) =>
      tx.plan.findMany({
        orderBy: { priceMonthly: "asc" },
        select: { ...PLAN_SELECT, features: true },
      }),
    );
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      trialDays: p.trialDays,
      isActive: p.isActive,
      limits: (p.limits as PlanRow["limits"] | null) ?? {},
      modules: p.modules.map((m) => m.module),
      features: sanitizeFeatures(p.features ?? []),
      subscriberCount: p._count.subscriptions,
    }));
  } catch {
    const plans = await systemDb((tx) =>
      tx.plan.findMany({ orderBy: { priceMonthly: "asc" }, select: PLAN_SELECT }),
    );
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      trialDays: p.trialDays,
      isActive: p.isActive,
      limits: (p.limits as PlanRow["limits"] | null) ?? {},
      modules: p.modules.map((m) => m.module),
      features: defaultFeaturesForTier(asTier(p.name)),
      subscriberCount: p._count.subscriptions,
    }));
  }
}

export interface InvoiceRow {
  id: string;
  restaurantName: string;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  createdAt: string;
}

/** Recent platform invoices across all tenants. */
export async function listInvoices(limit = 200): Promise<InvoiceRow[]> {
  const invoices = await systemDb((tx) =>
    tx.restaurantInvoice.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amount: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        paidAt: true,
        createdAt: true,
        restaurant: { select: { name: true } },
      },
    }),
  );
  return invoices.map((i) => ({
    id: i.id,
    restaurantName: i.restaurant.name,
    amount: i.amount,
    status: i.status,
    periodStart: i.periodStart.toISOString(),
    periodEnd: i.periodEnd.toISOString(),
    paidAt: i.paidAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));
}
