-- ============================================================================
-- Neighborhood Partner & Territory module.
--
-- ADDITIVE ONLY. New tables, plus:
--   restaurants."commercialTrack"  NOT NULL DEFAULT 'standard'  (metadata-only
--     add: every existing restaurant reads 'standard' and never enters this
--     module or has a commission calculated)
--   orders."sourceChannel", orders."territoryId"  nullable, no default
--     (attribution only; no foreign key, so adding them never scans orders)
-- No existing column, policy, checkout path or plan rule is changed.
--
-- Conventions follow this codebase rather than the brief's literal SQL: TEXT
-- ids (restaurants.id is TEXT), camelCase columns, TIMESTAMP(3), and money as
-- integer CENTAVOS (exact, never float — the same as every other amount in
-- Servd). Commission rates are integer basis points: 1000 = 10.00%.
-- Run BEFORE the code that uses it is deployed. Idempotent.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "commercialTrack" TEXT NOT NULL DEFAULT 'standard';
DO $$ BEGIN
  ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_commercialTrack_check"
    CHECK ("commercialTrack" IN ('standard','neighborhood'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sourceChannel" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "territoryId" TEXT;

CREATE TABLE IF NOT EXISTS "territories" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"              TEXT NOT NULL,
  "city"              TEXT,
  "province"          TEXT,
  "householdEstimate" INTEGER,
  "status"            TEXT NOT NULL DEFAULT 'prospect'
                      CHECK ("status" IN ('prospect','active','paused','closed')),
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "territories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "territory_partners" (
  "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "territoryId"        TEXT NOT NULL REFERENCES "territories"("id") ON DELETE RESTRICT,
  "restaurantId"       TEXT NOT NULL REFERENCES "restaurants"("id") ON DELETE RESTRICT,
  "category"           TEXT NOT NULL DEFAULT 'food',
  "activationFee"      INTEGER NOT NULL DEFAULT 1000000 CHECK ("activationFee" >= 0),   -- centavos (₱10,000)
  "activationPaidAt"   TIMESTAMP(3),
  "activationMethod"   TEXT,
  "activationRef"      TEXT,
  "commissionRateBps"  INTEGER NOT NULL DEFAULT 1000 CHECK ("commissionRateBps" BETWEEN 0 AND 10000),
  "exclusive"          BOOLEAN NOT NULL DEFAULT true,
  "startsOn"           DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
  "endsOn"             DATE,
  "status"             TEXT NOT NULL DEFAULT 'pending'
                       CHECK ("status" IN ('pending','active','paused','ended')),
  "notes"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "territory_partners_pkey" PRIMARY KEY ("id")
);
-- Exclusivity: one ACTIVE exclusive partner per territory + category.
CREATE UNIQUE INDEX IF NOT EXISTS "territory_category_exclusive"
  ON "territory_partners" ("territoryId", "category")
  WHERE "status" = 'active' AND "exclusive" = true;
CREATE INDEX IF NOT EXISTS "territory_partners_restaurant_idx" ON "territory_partners" ("restaurantId");

CREATE TABLE IF NOT EXISTS "distribution_campaigns" (
  "id"                      TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "territoryPartnerId"      TEXT NOT NULL REFERENCES "territory_partners"("id") ON DELETE CASCADE,
  "quantity"                INTEGER NOT NULL DEFAULT 500 CHECK ("quantity" >= 0),
  "printedAt"               TIMESTAMP(3),
  "distributionStartedAt"   TIMESTAMP(3),
  "distributionCompletedAt" TIMESTAMP(3),
  "householdsCovered"       INTEGER,
  "unitCost"                INTEGER,          -- centavos per magnet (internal)
  "distributor"             TEXT,
  "notes"                   TEXT,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "distribution_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "distribution_campaigns_partner_idx" ON "distribution_campaigns" ("territoryPartnerId");

CREATE TABLE IF NOT EXISTS "commission_statements" (
  "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "territoryPartnerId" TEXT NOT NULL REFERENCES "territory_partners"("id") ON DELETE RESTRICT,
  "periodStart"        DATE NOT NULL,
  "periodEnd"          DATE NOT NULL,
  "orderCount"         INTEGER NOT NULL DEFAULT 0,
  "grossOrders"        INTEGER NOT NULL DEFAULT 0,   -- centavos (commissionable totals)
  "commissionDue"      INTEGER NOT NULL DEFAULT 0,   -- centavos
  "status"             TEXT NOT NULL DEFAULT 'draft'
                       CHECK ("status" IN ('draft','issued','partially_paid','paid','written_off')),
  "issuedAt"           TIMESTAMP(3),
  "dueAt"              DATE,
  "paidAt"             TIMESTAMP(3),
  "amountPaid"         INTEGER NOT NULL DEFAULT 0,   -- centavos
  "writeOffReason"     TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_statements_period_key" UNIQUE ("territoryPartnerId", "periodStart", "periodEnd")
);

CREATE TABLE IF NOT EXISTS "commission_entries" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  -- NULL only for an adjustment (a correction to an issued statement, which is
  -- never edited): kind = 'adjustment'.
  "orderId"             TEXT REFERENCES "orders"("id") ON DELETE RESTRICT,
  "kind"                TEXT NOT NULL DEFAULT 'order' CHECK ("kind" IN ('order','adjustment')),
  "territoryPartnerId"  TEXT NOT NULL REFERENCES "territory_partners"("id") ON DELETE RESTRICT,
  "orderTotal"          INTEGER NOT NULL,   -- centavos, snapshot
  "commissionableTotal" INTEGER NOT NULL,   -- centavos, goods less discount; no fees or tips
  "rateBps"             INTEGER NOT NULL,   -- snapshot of the rate at order time
  "commissionAmount"    INTEGER NOT NULL,   -- centavos, rounded half up at write time
  "paymentMethod"       TEXT,               -- 'online' | 'cod'
  "state"               TEXT NOT NULL DEFAULT 'pending'
                        CHECK ("state" IN ('pending','confirmed','disputed','waived','settled','cancelled')),
  "statementId"         TEXT REFERENCES "commission_statements"("id") ON DELETE RESTRICT,
  "disputeNote"         TEXT,
  "note"                TEXT,
  "orderedAt"           TIMESTAMP(3),       -- the order's own time: statements are by order date
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_entries_order_or_adjustment"
    CHECK (("kind" = 'order' AND "orderId" IS NOT NULL) OR ("kind" = 'adjustment' AND "orderId" IS NULL))
);
-- One commission per order, ever: re-running accrual can never double-charge.
CREATE UNIQUE INDEX IF NOT EXISTS "commission_entries_order_key"
  ON "commission_entries" ("orderId") WHERE "orderId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "commission_entries_partner_state_idx"
  ON "commission_entries" ("territoryPartnerId", "state", "orderedAt");
CREATE INDEX IF NOT EXISTS "commission_entries_statement_idx" ON "commission_entries" ("statementId");

-- RLS, the same pattern as the agent-portal tables: the platform (systemDb)
-- reads and writes everything; a restaurant may read only its own agreement,
-- entries and statements.
ALTER TABLE "territories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_only ON "territories";
CREATE POLICY system_only ON "territories" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "territory_partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "territory_partners" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "territory_partners";
CREATE POLICY tenant_read ON "territory_partners" FOR SELECT
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
DROP POLICY IF EXISTS system_write ON "territory_partners";
CREATE POLICY system_write ON "territory_partners" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "distribution_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "distribution_campaigns" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_only ON "distribution_campaigns";
CREATE POLICY system_only ON "distribution_campaigns" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "commission_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_statements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "commission_statements";
CREATE POLICY tenant_read ON "commission_statements" FOR SELECT
  USING (app.is_super_admin() OR EXISTS (
    SELECT 1 FROM "territory_partners" tp
    WHERE tp."id" = "territoryPartnerId" AND tp."restaurantId" = app.current_restaurant_id()));
DROP POLICY IF EXISTS system_write ON "commission_statements";
CREATE POLICY system_write ON "commission_statements" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "commission_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "commission_entries";
CREATE POLICY tenant_read ON "commission_entries" FOR SELECT
  USING (app.is_super_admin() OR EXISTS (
    SELECT 1 FROM "territory_partners" tp
    WHERE tp."id" = "territoryPartnerId" AND tp."restaurantId" = app.current_restaurant_id()));
DROP POLICY IF EXISTS system_write ON "commission_entries";
CREATE POLICY system_write ON "commission_entries" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

GRANT SELECT ON "territory_partners", "commission_statements", "commission_entries" TO app_user;

COMMIT;

-- Checks: every existing restaurant reads 'standard'; the new tables exist with RLS forced.
SELECT "commercialTrack", count(*) FROM "restaurants" GROUP BY 1;
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
WHERE relname IN ('territories','territory_partners','distribution_campaigns','commission_entries','commission_statements');
