import type { Prisma } from "@prisma/client";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";

/**
 * Picks the default signup plan: the cheapest active plan (e.g. Starter).
 * Returns null if no plans are seeded yet (trial still works, just unlimited).
 */
export async function getDefaultPlan(tx: Prisma.TransactionClient) {
  return tx.plan.findFirst({
    where: { isActive: true },
    orderBy: { priceMonthly: "asc" },
  });
}

/**
 * Provisions a 30-day (plan.trialDays) trialing subscription for a brand-new
 * restaurant and links the plan. Call inside a super-admin tx during signup.
 */
export async function startTrial(
  tx: Prisma.TransactionClient,
  restaurantId: string,
) {
  const plan = await getDefaultPlan(tx);
  if (!plan) return; // no plans yet — skip; restaurant stays unlimited/active
  const trialEndsAt = addMonths(new Date(), 0);
  trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays);

  await tx.restaurant.update({ where: { id: restaurantId }, data: { planId: plan.id } });
  await tx.subscription.create({
    data: {
      restaurantId,
      planId: plan.id,
      status: "trialing",
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
    },
  });
}

/** The restaurant's current (latest) subscription with its plan. */
export async function getCurrentSubscription(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.subscription.findFirst({
      orderBy: { createdAt: "desc" },
      include: { plan: { include: { modules: true } } },
    }),
  );
}

/** All active plans (for the billing portal + super-admin). */
export async function listPlans() {
  return systemDb((tx) =>
    tx.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
      include: { modules: { where: { enabled: true } } },
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
