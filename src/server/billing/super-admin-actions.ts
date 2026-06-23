"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, PlanModuleType } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runBillingCron, type CronSummary } from "@/server/billing/run-cron";
import { saveXenditCreds } from "@/server/billing/platform-settings";
import { provisionFreePlan } from "@/server/billing/subscription";
import { uniqueSlug } from "@/lib/slug";
import { addMonths } from "@/lib/billing/period";
import { ALL_FEATURES, type Feature } from "@/lib/billing/features";

export type ActionState =
  | { ok?: boolean; message?: string; error?: string; credentials?: { username: string; password: string } }
  | null;

/** Synthetic email domain for username-only logins (no mail is ever sent). */
const LOGIN_EMAIL_DOMAIN = process.env.INTERNAL_LOGIN_DOMAIN || "staff.servdph.com";

function syntheticEmail(username: string): string {
  return `${username}@${LOGIN_EMAIL_DOMAIN}`;
}

/** Short, readable temp password for handoff (no ambiguous characters). */
function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[bytes[i] % chars.length];
  return out;
}

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

function featuresFromForm(formData: FormData): Feature[] {
  return ALL_FEATURES.filter((f) => formData.get(`feature_${f}`) === "on");
}

/**
 * Persist a plan's enabled features. Runs in its OWN transaction (best-effort)
 * so a not-yet-migrated `features` column can't poison/roll back the main plan
 * save — and so changes apply live to every subscription on the plan.
 */
async function setPlanFeatures(planId: string, features: Feature[]): Promise<void> {
  try {
    await systemDb((tx) => tx.plan.update({ where: { id: planId }, data: { features } }));
  } catch {
    /* `plan.features` column not migrated yet — skip; tier defaults still apply */
  }
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
  let planId: string;
  try {
    planId = await systemDb(async (tx) => {
      const plan = await tx.plan.create({
        data: { name, priceMonthly, trialDays, limits, isActive: true },
        select: { id: true },
      });
      await syncModules(tx, plan.id, modulesFromForm(formData));
      return plan.id;
    });
  } catch (e) {
    console.error("createPlan failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't create the plan." };
  }
  await setPlanFeatures(planId, featuresFromForm(formData));
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
  await setPlanFeatures(id, featuresFromForm(formData));
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
    ? await tx.plan.findUnique({ where: { id: planId }, select: { id: true } })
    : await tx.plan.findFirst({ where: { isActive: true }, orderBy: { priceMonthly: "asc" }, select: { id: true } });
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

// ---------------------------------------------------------------------------
// Payments (Xendit) — subscription billing provider
// ---------------------------------------------------------------------------

/** Save the platform's Xendit credentials (encrypted) for subscription billing. */
export async function saveXenditSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const secretKey = String(formData.get("secretKey") ?? "").trim();
  const callbackToken = String(formData.get("callbackToken") ?? "").trim();
  if (!secretKey || !/^xnd_/.test(secretKey)) {
    return { error: "Enter your Xendit secret key (starts with xnd_)." };
  }
  if (!callbackToken) return { error: "Enter your Xendit webhook callback token." };
  try {
    await saveXenditCreds({ secretKey, callbackToken });
  } catch (e) {
    console.error("saveXenditSettings failed", e);
    return { error: e instanceof Error ? e.message : "Couldn't save. Run the migration if you haven't yet." };
  }
  revalidatePath("/super-admin/payments");
  return { ok: true, message: "Xendit connected. Subscriptions will activate automatically on payment." };
}

// ---------------------------------------------------------------------------
// Accounts — provision restaurant logins with the email pre-confirmed
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  restaurantName: z.string().trim().min(2, "Restaurant name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

/**
 * Super-admin: create a restaurant + owner login with the email PRE-CONFIRMED
 * (via the Supabase admin API), so the owner can sign in immediately — no
 * confirmation email needed. Provisions the tenant + admin staff + free trial,
 * exactly like self-serve signup.
 */
export async function createRestaurantAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = accountSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { restaurantName, email, password, phone } = parsed.data;

  // 1. Create the auth user, email pre-confirmed (no confirmation link).
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return { error: /registered|exists/i.test(error?.message ?? "") ? "That email already has an account." : error?.message ?? "Couldn't create the login." };
  }
  const authUserId = data.user.id;

  // 2. Provision the tenant + owner + trial.
  try {
    await systemDb(async (tx) => {
      const slug = await uniqueSlug(restaurantName, async (s) => {
        const hit = await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } });
        return !!hit;
      });
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          displayName: restaurantName,
          slug,
          status: "active",
          ...(phone ? { printerConfig: { receipt: { phone } } as unknown as Prisma.InputJsonValue } : {}),
          staff: { create: { authUserId, role: "admin", email } },
        },
        select: { id: true },
      });
      await provisionFreePlan(tx, restaurant.id);
    });
  } catch (e) {
    // Roll back the orphaned auth user so the email can be reused.
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Couldn't create the account.";
    return { error: /unique/i.test(msg) ? "That email already has an account." : msg };
  }

  refresh();
  return { ok: true, message: `Account created for ${restaurantName} — they can log in right away.` };
}

const businessSchema = z.object({
  restaurantName: z.string().trim().min(2, "Business name is required").max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(30)
    .regex(/^[a-z0-9._-]+$/, "Username can use letters, numbers, dot, dash, underscore"),
  businessAddress: z.string().trim().max(300).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
});

/**
 * Super-admin: create a business by NAME + USERNAME (no email). We generate a
 * temporary password and provision a username-based login; the owner signs in
 * with the username + temp password and sets their real email/password from the
 * dashboard. Address + map pin are recorded so the super-admin can visit anytime.
 */
export async function createBusinessAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = businessSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    username: formData.get("username"),
    businessAddress: formData.get("businessAddress") ?? "",
    latitude: formData.get("latitude") ?? "",
    longitude: formData.get("longitude") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { restaurantName, username, businessAddress } = parsed.data;
  const latitude = typeof parsed.data.latitude === "number" ? parsed.data.latitude : null;
  const longitude = typeof parsed.data.longitude === "number" ? parsed.data.longitude : null;

  // Username must be unique (it's how they log in).
  const taken = await systemDb((tx) => tx.staffUser.findFirst({ where: { username }, select: { id: true } }));
  if (taken) return { error: "That username is already taken." };

  // Create the login under a synthetic email (no mail is ever sent).
  const password = tempPassword();
  const email = syntheticEmail(username);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    return { error: /registered|exists/i.test(error?.message ?? "") ? "That username is already taken." : error?.message ?? "Couldn't create the login." };
  }
  const authUserId = data.user.id;

  try {
    await systemDb(async (tx) => {
      const slug = await uniqueSlug(restaurantName, async (s) => {
        const hit = await tx.restaurant.findUnique({ where: { slug: s }, select: { id: true } });
        return !!hit;
      });
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          displayName: restaurantName,
          slug,
          status: "active",
          businessAddress: businessAddress || null,
          latitude,
          longitude,
          staff: { create: { authUserId, role: "admin", email, username } },
        },
        select: { id: true },
      });
      await provisionFreePlan(tx, restaurant.id);
    });
  } catch (e) {
    try {
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Couldn't create the business.";
    return { error: /unique/i.test(msg) ? "That username or business already exists." : msg };
  }

  refresh();
  revalidatePath("/super-admin/accounts");
  return {
    ok: true,
    message: `${restaurantName} created. Give the owner these login details — they can change their email & password from the dashboard:`,
    credentials: { username, password },
  };
}
