-- Neighborhood partners pay their weekly commission by bank QR and upload the
-- receipt; the founder confirms it, and only then is it applied to their
-- statements (oldest first). The receipt is a path in the PRIVATE
-- commission-receipts bucket, shown only through short-lived signed URLs.
-- New table only. Idempotent. (Applied 2026-11-06.)
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "commission_payments" (
  "id"                 TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "territoryPartnerId" TEXT NOT NULL REFERENCES "territory_partners"("id") ON DELETE RESTRICT,
  "amount"             INTEGER NOT NULL CHECK ("amount" > 0),   -- centavos, what the partner says they paid
  "reference"          TEXT,
  "receiptPath"        TEXT NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'submitted' CHECK ("status" IN ('submitted','confirmed','rejected')),
  "reason"             TEXT,
  "submittedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"          TIMESTAMP(3),
  CONSTRAINT "commission_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "commission_payments_partner_idx" ON "commission_payments" ("territoryPartnerId", "status");
ALTER TABLE "commission_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "commission_payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "commission_payments";
CREATE POLICY tenant_read ON "commission_payments" FOR SELECT
  USING (app.is_super_admin() OR EXISTS (
    SELECT 1 FROM "territory_partners" tp
    WHERE tp."id" = "territoryPartnerId" AND tp."restaurantId" = app.current_restaurant_id()));
DROP POLICY IF EXISTS system_write ON "commission_payments";
CREATE POLICY system_write ON "commission_payments" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT ON "commission_payments" TO app_user;
COMMIT;
