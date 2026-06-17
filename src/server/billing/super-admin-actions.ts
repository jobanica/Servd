"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, PlanModuleType } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { runBillingCron, type CronSummary } from "@/server/billing/run-cron";
import { addMonths } from "@/lib/billing/period";

export type ActionState = { ok?: boolean; message?: string; error?: string } | null;

const ALL_MODULES: PlanModuleType[] = ["hris", "inventory", "custom_domain"];

function refresh() {
  revalidatePath("/super-admin");
  revalidatePath("/super-admin/subscriptions");
  revalidatePath("/super-admin/plans");
  revalidatePath("/super-admin/invoices");
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const planSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  price: z.coerce.number().min(0, "Price can't be negative"), // pesos (UI) → centavos
  trialDays: z.coerce.number().int().min(0).max(365),
  maxTables: z.coerce.number().int().min(0).optional(),
  maxStaff: z.coerce.number().int().min(0).optional(),
  smsIncluded: z.coerce.number().int().min(0).optional(),
});

function parsePlan(formData: FormData) {
  return planSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    trialDays: formData.get("trialDays"),
    maxTables: formData.get("maxTables") || undefined,
    maxStaff: formData.get("maxStaff") || undefined,
    smsIncluded: formData.get("smsIncluded") || undefined,
  });
}

function modulesFromForm(formData: FormData): PlanModuleType[] {
  return ALL_MODULES.filter((m) => formData.get(`module_${m}`) === "on");
}

async function syncModules(tx: Prisma.TransactionClient, planId: string, modules: PlanModuleType[]) {
  const enabled = new Set(modules);
  for (const m of ALL_MODULES) {
    await tx.planModule.upsert({
      where: { planId_module: { planId, module: m } },
      create: { planId, module: m, enabled: enabled.has(m) },
      update: { enabled: enabled.has(m) },
    });
  }
}

function buildLimits(d: { maxTables?: number; maxStaff?: number; smsIncluded?: number }): Prisma.InputJsonValue {
  // Only include defined keys — Prisma rejects `undefined` inside a Json value,
  // and an omitted key means "unlimited" to the entitlements helper.
  const limits: Record<string, number> = {};
  if (d.maxTables !== undefined) limits.maxTables = d.maxTables;
  if (d.maxStaff !== undefined) limits.maxStaff = d.maxStaff;
  if (d.smsIncluded !== undefined) limits.smsIncluded = d.smsIncluded;
  return limits;
}

export async function createPlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = parsePlan(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, price, trialDays, maxTables, maxStaff, smsIncluded } = parsed.data;
  const priceMonthly = Math.round(price * 100);
  const limits = buildLimits({ maxTables, maxStaff, smsIncluded });
  try {
    await systemDb(async (tx) => {
      const plan = await tx.plan.create({
        data: { name, priceMonthly, trialDays, limits, isActive: true },
        select: { id: true },
      });
      await syncModules(tx, plan.id, modulesFromForm(formData));
    });
  } catch (e) {
    console.error("createPlan failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't create the plan." };
  }
  refresh();
  return { ok: true, message: `Plan “${name}” created.` };
}

export async function updatePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const parsed = parsePlan(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, price, trialDays, maxTables, maxStaff, smsIncluded } = parsed.data;
  const priceMonthly = Math.round(price * 100);
  const limits = buildLimits({ maxTables, maxStaff, smsIncluded });
  try {
    await systemDb(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: {
          name,
          priceMonthly,
          trialDays,
          limits,
        },
      });
      await syncModules(tx, id, modulesFromForm(formData));
    });
  } catch (e) {
    console.error("updatePlan failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't update the plan." };
  }
  refresh();
  return { ok: true, message: "Plan updated." };
}

/** Activate / archive a plan (archived plans can't be picked for new signups). */
export async function togglePlanActive(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await systemDb((tx) => tx.plan.update({ where: { id }, data: { isActive: active } }));
  refresh();
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/** Ensure a restaurant has a subscription row, creating one if missing. */
async function ensureSubscription(tx: Prisma.TransactionClient, restaurantId: string, planId?: string) {
  const sub = await tx.subscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });
  if (sub) return sub;
  const plan = planId
    ? await tx.plan.findUnique({ where: { id: planId } })
    : await tx.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } });
  if (!plan) throw new Error("No plan available");
  return tx.subscription.create({
    data: { restaurantId, planId: plan.id, status: "trialing" },
  });
}

/** Move a restaurant onto a different plan (effective immediately). */
export async function assignPlan(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const planId = String(formData.get("planId"));
  if (!planId) return;
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId, planId);
    await tx.subscription.update({ where: { id: sub.id }, data: { planId } });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { planId } });
  });
  refresh();
}

const STATUSES = ["trialing", "active", "past_due", "cancelled"] as const;

/** Force a subscription status (and keep the restaurant access in sync). */
export async function setSubscriptionStatus(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const status = String(formData.get("status"));
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId);
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: status as (typeof STATUSES)[number],
        // Re-activating clears the dunning counter and cancel flag.
        ...(status === "active" ? { failedCharges: 0, cancelAtPeriodEnd: false } : {}),
      },
    });
    // Active/trialing → restore access; cancelled/past_due → suspend access.
    const restaurantStatus = status === "active" || status === "trialing" ? "active" : "suspended";
    await tx.restaurant.update({ where: { id: restaurantId }, data: { status: restaurantStatus } });
  });
  refresh();
}

/** Extend (or start) the free trial by N days from today. */
export async function extendTrial(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const days = Math.max(1, Math.min(365, Number(formData.get("days") ?? 0)));
  if (!days) return;
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId);
    // Extend from the later of "now" and the current trial end.
    const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date();
    const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "trialing", trialEndsAt, currentPeriodEnd: trialEndsAt, cancelAtPeriodEnd: false },
    });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { status: "active" } });
  });
  refresh();
}

/**
 * Comp a free month: mark active and push the paid period out a month with no
 * charge. Handy for partnerships / making good on an outage.
 */
export async function compMonth(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  await systemDb(async (tx) => {
    const sub = await ensureSubscription(tx, restaurantId);
    const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "active", currentPeriodEnd: addMonths(base, 1), failedCharges: 0, cancelAtPeriodEnd: false },
    });
    await tx.restaurant.update({ where: { id: restaurantId }, data: { status: "active" } });
  });
  refresh();
}

/** Suspend / restore a restaurant's access without touching the subscription. */
export async function setRestaurantAccess(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurantId"));
  const access = String(formData.get("access")); // "active" | "suspended"
  if (access !== "active" && access !== "suspended") return;
  await systemDb((tx) => tx.restaurant.update({ where: { id: restaurantId }, data: { status: access } }));
  refresh();
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function markInvoicePaid(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  await systemDb((tx) =>
    tx.restaurantInvoice.update({ where: { id }, data: { status: "paid", paidAt: new Date() } }),
  );
  refresh();
}

export async function voidInvoice(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  await systemDb((tx) => tx.restaurantInvoice.update({ where: { id }, data: { status: "void" } }));
  refresh();
}

// ---------------------------------------------------------------------------
// Billing run
// ---------------------------------------------------------------------------

export type CronState = { ok?: boolean; summary?: CronSummary; error?: string } | null;

/** Run the daily billing cycle on demand (charges/dunning/suspensions). */
export async function runBillingNow(_prev: CronState, _formData: FormData): Promise<CronState> {
  await requireSuperAdmin();
  try {
    const summary = await runBillingCron();
    refresh();
    return { ok: true, summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Billing run failed." };
  }
}
