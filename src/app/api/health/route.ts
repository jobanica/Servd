import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Diagnostics: confirms env vars are present, the DB is reachable, the schema is
 * up to date, and plans are seeded. Returns only booleans/counts (no secrets).
 * Hit /api/health right after a deploy to verify everything's wired.
 */
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_URL: !!process.env.DIRECT_URL,
    CREDENTIALS_ENCRYPTION_KEY: !!process.env.CREDENTIALS_ENCRYPTION_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
  };

  // Optional features (present-or-not, never required for `healthy`).
  const features = {
    aiInsights: !!process.env.ANTHROPIC_API_KEY,
  };

  let db: Record<string, unknown> = { connected: false };
  try {
    db = await systemDb(async (tx) => {
      const planCount = await tx.plan.count();
      // Spot-check columns/tables added across later phases.
      const cols = await tx.$queryRaw<{ table_name: string; column_name: string }[]>`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public' and (
          (table_name = 'restaurants' and column_name = 'onboardingCompletedAt') or
          (table_name = 'subscriptions' and column_name = 'trialEndsAt') or
          (table_name = 'menu_items' and column_name = 'videoUrl') or
          (table_name = 'orders' and column_name = 'inventoryDeductedAt') or
          (table_name = 'orders' and column_name = 'servedAt') or
          (table_name = 'orders' and column_name = 'discountAmount') or
          (table_name = 'orders' and column_name = 'orderType') or
          (table_name = 'orders' and column_name = 'customerLat') or
          (table_name = 'restaurants' and column_name = 'loyaltyEnabled') or
          (table_name = 'restaurants' and column_name = 'customDomain')
        )`;
      const tables = await tx.$queryRaw<{ table_name: string }[]>`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_name in
          ('plan_modules','restaurant_invoices','menu_item_translations','inventory_items','employees','promotions','loyalty_accounts','expenses','payroll_settings','menu_item_costs','storefront_settings')`;

      const have = new Set([
        ...cols.map((c) => `${c.table_name}.${c.column_name}`),
        ...tables.map((t) => t.table_name),
      ]);
      const expected = [
        "restaurants.onboardingCompletedAt",
        "subscriptions.trialEndsAt",
        "menu_items.videoUrl",
        "orders.inventoryDeductedAt",
        "orders.servedAt",
        "orders.discountAmount",
        "orders.orderType",
        "orders.customerLat",
        "restaurants.loyaltyEnabled",
        "restaurants.customDomain",
        "plan_modules",
        "restaurant_invoices",
        "menu_item_translations",
        "inventory_items",
        "employees",
        "promotions",
        "loyalty_accounts",
        "expenses",
        "payroll_settings",
        "menu_item_costs",
        "storefront_settings",
      ];
      const missing = expected.filter((e) => !have.has(e));

      return {
        connected: true,
        planCount,
        schemaCurrent: missing.length === 0,
        missing,
      };
    });
  } catch (e) {
    db = { connected: false, error: e instanceof Error ? e.message : "DB error" };
  }

  const healthy =
    Object.values(env).every((v) => v !== false && v !== null) &&
    db.connected === true &&
    db.schemaCurrent === true &&
    (db.planCount as number) > 0;

  return Response.json({ healthy, env, features, db }, { status: healthy ? 200 : 503 });
}
