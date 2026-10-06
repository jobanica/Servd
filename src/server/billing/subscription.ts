import type { Prisma } from "@prisma/client";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { addMonths } from "@/lib/billing/period";
import {
  ALL_ACCESS_PLAN_ID,
  ALL_ACCESS_TRIAL_DAYS,
  isAllAccessPlan,
} from "@/lib/billing/all-access";

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

/** Trial length for the OLDER signup path — kept for the fallback when the
 * All Access plan row hasn't been created yet. */
export const SIGNUP_TRIAL_DAYS = 30;

/** The lowest-priced active plan = the Free tier. */
export async function getDefaultPlan(tx: Prisma.TransactionClient) {
  return tx.plan.findFirst({
    where: { isActive: true },
    orderBy: { priceMonthly: "asc" },
    select: PLAN_FIELDS,
  });
}

/** The highest-priced active plan = the top tier (Business). */
export async function getTopPlan(tx: Prisma.TransactionClient) {
  return tx.plan.findFirst({
    where: { isActive: true },
    orderBy: { priceMonthly: "desc" },
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
 * The ₱800 All Access plan, by its fixed id. Null when the migration that
 * creates it (prisma/manual/add-all-access-plan.sql) hasn't been run.
 */
export async function getAllAccessPlan(tx: Prisma.TransactionClient) {
  return tx.plan.findFirst({ where: { id: ALL_ACCESS_PLAN_ID }, select: PLAN_FIELDS });
}

/**
 * Provisions a brand-new restaurant: a 30-day All Access trial, then ₱800 a
 * month. Every feature but the Content Calendar, no card.
 *
 * Called ONLY where an account is created or first goes live — signup, the
 * super-admin's two create paths, a demo being converted, a self-built preview
 * going live. That is the whole grandfathering mechanism: an account that
 * already exists never passes through here again, so it keeps the plan it has.
 *
 * Falls back to the old behaviour (the top plan's trial, which drops to Free
 * when it ends) when the All Access row doesn't exist yet. A deploy that lands
 * before the migration must not stop people signing up; it just means those
 * few accounts start on the old terms. Run the migration first.
 */
export async function provisionTrial(tx: Prisma.TransactionClient, restaurantId: string) {
  const plan =
    (await getAllAccessPlan(tx)) ?? (await getTopPlan(tx)) ?? (await getDefaultPlan(tx));
  if (!plan) return; // no plans yet — skip; restaurant stays active
  const trialEndsAt = new Date();
  trialEndsAt.setDate(
    trialEndsAt.getDate() +
      (isAllAccessPlan(plan.id) ? ALL_ACCESS_TRIAL_DAYS : SIGNUP_TRIAL_DAYS),
  );
  // `select: { id }` keeps Prisma's RETURNING from referencing newer columns a
  // schema-lagged live DB may not have yet.
  await tx.restaurant.update({
    where: { id: restaurantId },
    data: { planId: plan.id },
    select: { id: true },
  });
  await tx.subscription.create({
    data: {
      restaurantId,
      planId: plan.id,
      status: "trialing",
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
    },
    select: { id: true },
  });
}

/**
 * Provisions LIFETIME FREE access on the Free plan (kept for completeness; new
 * accounts now use provisionTrial). Call inside a super-admin tx.
 */
export async function provisionFreePlan(
  tx: Prisma.TransactionClient,
  restaurantId: string,
) {
  const plan = (await getFreePlan(tx)) ?? (await getDefaultPlan(tx));
  if (!plan) return; // no plans yet — skip; restaurant stays active
  // `select: { id }` keeps Prisma's RETURNING from referencing newer columns
  // that a schema-lagged live DB may not have yet (e.g. lowStockAlertPhone).
  await tx.restaurant.update({
    where: { id: restaurantId },
    data: { planId: plan.id },
    select: { id: true },
  });
  await tx.subscription.create({
    data: {
      restaurantId,
      planId: plan.id,
      status: "active", // lifetime free — never trials, never expires
    },
    select: { id: true },
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
    const sub = await tx.subscription.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!sub) throw new Error("No subscription");
    await tx.subscription.update({ where: { id: sub.id }, data: { planId }, select: { id: true } });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { planId }, select: { id: true } });
  });
}

/**
 * Owner picks a plan from the billing page:
 *   - Free            → lifetime free, active immediately (no trial, no expiry).
 *   - Paid + saved card → switch now; the next cycle bills the new price.
 *   - Paid, no card   → NO new free trial. Keep the account's existing trial
 *                       window (the 30-day signup trial) if any; otherwise the
 *                       billing page prompts for a payment method. When an unpaid
 *                       trial ends the daily cron reverts them to the Free plan.
 *
 * Schema-lag resilient: reads use explicit selects (only always-present columns),
 * and if the full write hits a newer column the live DB hasn't migrated yet, we
 * retry with the bare essentials in a FRESH transaction (an aborted Postgres tx
 * can't be reused) so the upgrade still succeeds instead of showing "error".
 */
export async function startPlan(restaurantId: string, planId: string) {
  // `minimal` writes only the columns that exist on every DB version.
  const apply = (minimal: boolean) =>
    tenantDb(restaurantId, async (tx) => {
      const plan = await tx.plan.findUnique({ where: { id: planId }, select: PLAN_FIELDS });
      if (!plan) throw new Error("Unknown plan");
      // Select only what we read — guaranteed to exist on every DB version.
      const sub = await tx.subscription.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true, providerPaymentMethodId: true },
      });

      const isFree = plan.priceMonthly <= 0;
      const hasCard = !isFree && !!sub?.providerPaymentMethodId;

      // Decide the resulting status + trial window.
      const status: "active" | "trialing" = isFree || hasCard ? "active" : "trialing";
      let data: Prisma.SubscriptionUncheckedUpdateInput = { planId, status };
      if (!minimal) {
        if (isFree) {
          data = { planId, status, trialEndsAt: null, cancelAtPeriodEnd: false };
        } else {
          // Paid plan: no new free trial. Keep the existing trial window (the
          // 30-day signup trial) untouched by not writing trialEndsAt — with a
          // card they're active; without one they stay `trialing` and the billing
          // page prompts to pay (cron reverts to Free when an unpaid trial ends).
          data = { planId, status, cancelAtPeriodEnd: false };
        }
      }

      if (sub) await tx.subscription.update({ where: { id: sub.id }, data, select: { id: true } });
      else await tx.subscription.create({ data: { restaurantId, ...data } as Prisma.SubscriptionUncheckedCreateInput, select: { id: true } });
      await tx.restaurant.update({ where: { id: restaurantId }, data: { planId, status: "active" }, select: { id: true } });
    });

  try {
    await apply(false);
  } catch (e) {
    // Re-throw genuine "Unknown plan" — only retry on likely schema-lag write errors.
    if (e instanceof Error && e.message === "Unknown plan") throw e;
    await apply(true);
  }
}

/** Schedule cancellation at period end. */
export async function cancelAtPeriodEnd(restaurantId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const sub = await tx.subscription.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!sub) return;
    await tx.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
      select: { id: true },
    });
  });
}
