import type { Prisma } from "@prisma/client";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";

/**
 * Explicit plan fields — everything EXCEPT `features` (which ships in a later
 * migration). Selecting columns explicitly means plan reads don't 500 if that
 * column hasn't been added to the database yet.
 */
export const PLAN_FIELDS = {
  id: true,
  name: true,
  priceMonthly: true,
  limits: true,
  trialDays: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.PlanSelect;

/**
 * Free trial length for a PAID plan — no credit card required. The Free plan is
 * lifetime (it never trials or expires); this only applies when an owner chooses
 * to try Growth or Business.
 */
export const TRIAL_DAYS = 14;

/** The lowest-priced active plan = the Free tier. */
export async function getDefaultPlan(tx: Prisma.TransactionClient) {
  return tx.plan.findFirst({
    where: { isActive: true },
    orderBy: { priceMonthly: "asc" },
    select: PLAN_FIELDS,
  });
}

/** The Free (₱0) plan, if one is seeded — used for lifetime-free access. */
export async function getFreePlan(tx: Prisma.TransactionClient) {
  return tx.plan.findFirst({
    where: { isActive: true, priceMonthly: { lte: 0 } },
    orderBy: { priceMonthly: "asc" },
    select: PLAN_FIELDS,
  });
}

/**
 * Provisions LIFETIME FREE access for a brand-new restaurant: an active
 * subscription on the Free plan with no trial and no expiry. Owners upgrade to a
 * paid plan later (with a 14-day trial) from the billing page. Call inside a
 * super-admin tx during signup / account creation.
 */
export async function provisionFreePlan(
  tx: Prisma.TransactionClient,
  restaurantId: string,
) {
  const plan = (await getFreePlan(tx)) ?? (await getDefaultPlan(tx));
  if (!plan) return; // no plans yet — skip; restaurant stays active
  await tx.restaurant.update({ where: { id: restaurantId }, data: { planId: plan.id } });
  await tx.subscription.create({
    data: {
      restaurantId,
      planId: plan.id,
      status: "active", // lifetime free — never trials, never expires
    },
  });
}

/** The restaurant's current (latest) subscription with its plan. */
export async function getCurrentSubscription(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.subscription.findFirst({
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { ...PLAN_FIELDS, modules: true } } },
    }),
  );
}

/** All active plans (for the billing portal + super-admin). */
export async function listPlans() {
  return systemDb((tx) =>
    tx.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
      select: { ...PLAN_FIELDS, modules: { where: { enabled: true } } },
    }),
  );
}

/** Owner switches plan (takes effect on the current subscription). */
export async function changePlan(restaurantId: string, planId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const sub = await tx.subscription.findFirst({ orderBy: { createdAt: "desc" } });
    if (!sub) throw new Error("No subscription");
    await tx.subscription.update({ where: { id: sub.id }, data: { planId } });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { planId } });
  });
}

/**
 * Owner picks a plan from the billing page:
 *   - Free            → lifetime free, active immediately (no trial, no expiry).
 *   - Paid + saved card → switch now; the next cycle bills the new price.
 *   - Paid, no card   → start a 14-day FREE TRIAL (no card). When it ends unpaid
 *                       the daily cron reverts them to the Free plan.
 */
export async function startPlan(restaurantId: string, planId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const plan = await tx.plan.findUnique({ where: { id: planId }, select: PLAN_FIELDS });
    if (!plan) throw new Error("Unknown plan");
    const sub = await tx.subscription.findFirst({ orderBy: { createdAt: "desc" } });

    // Free plan → lifetime free.
    if (plan.priceMonthly <= 0) {
      const data = { planId, status: "active" as const, trialEndsAt: null, cancelAtPeriodEnd: false };
      if (sub) await tx.subscription.update({ where: { id: sub.id }, data });
      else await tx.subscription.create({ data: { restaurantId, ...data } });
      await tx.restaurant.update({ where: { id: restaurantId }, data: { planId, status: "active" } });
      return;
    }

    // Paid plan with a card already on file → switch now (bills next cycle).
    if (sub?.providerPaymentMethodId) {
      await tx.subscription.update({ where: { id: sub.id }, data: { planId, cancelAtPeriodEnd: false } });
      await tx.restaurant.update({ where: { id: restaurantId }, data: { planId } });
      return;
    }

    // Paid plan, no card → 14-day free trial.
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    const data = { planId, status: "trialing" as const, trialEndsAt, currentPeriodEnd: trialEndsAt, cancelAtPeriodEnd: false };
    if (sub) await tx.subscription.update({ where: { id: sub.id }, data });
    else await tx.subscription.create({ data: { restaurantId, ...data } });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { planId, status: "active" } });
  });
}

/** Schedule cancellation at period end. */
export async function cancelAtPeriodEnd(restaurantId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const sub = await tx.subscription.findFirst({ orderBy: { createdAt: "desc" } });
    if (!sub) return;
    await tx.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });
  });
}
