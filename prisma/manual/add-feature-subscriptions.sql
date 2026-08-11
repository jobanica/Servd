-- Per-feature monthly subscriptions (e.g. content scheduler ₱499/mo).
-- Run in the Supabase SQL editor. Idempotent.
CREATE TABLE IF NOT EXISTS "feature_subscriptions" (
  "id"               TEXT NOT NULL,
  "restaurantId"     TEXT NOT NULL,
  "feature"          TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "priceMonthly"     INTEGER NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3),
  "providerRef"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feature_subscriptions_providerRef_key"
  ON "feature_subscriptions" ("providerRef");
CREATE UNIQUE INDEX IF NOT EXISTS "feature_subscriptions_restaurantId_feature_key"
  ON "feature_subscriptions" ("restaurantId", "feature");
CREATE INDEX IF NOT EXISTS "feature_subscriptions_status_periodEnd_idx"
  ON "feature_subscriptions" ("status", "currentPeriodEnd");

DO $$ BEGIN
  ALTER TABLE "feature_subscriptions" ADD CONSTRAINT "feature_subscriptions_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "feature_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "feature_subscriptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "feature_subscriptions";
CREATE POLICY tenant_isolation ON "feature_subscriptions"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "feature_subscriptions" TO app_user;
