-- ============================================================================
-- CANVEXIA agent portal connection (product slug: servdph).
--
-- Run in the Supabase SQL editor BEFORE the code that uses it is deployed.
-- Additive only and idempotent: five NEW tables, two triggers. No existing
-- table, column or row is touched, so every existing account is unaffected —
-- an account with no agent code simply has no row in any of these.
--
--   agent_accounts                 restaurants that came through an agent
--   product_event_outbox           events queued for the portal
--   product_callback_inbox         callbacks received (exactly-once)
--   subscription_manual_payments   bank-transfer receipts and their outcome
--   payment_collection             where owners send money (one row)
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- agent_accounts
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "agent_accounts" (
  "restaurantId"              TEXT NOT NULL,
  "agentCode"                 TEXT NOT NULL,
  "ownerName"                 TEXT NOT NULL,
  "ownerPhone"                TEXT NOT NULL,
  "contractStatus"            TEXT NOT NULL DEFAULT 'unsigned',
  "contractId"                TEXT,
  "contractSignedAt"          TIMESTAMP(3),
  "contractMinimumTermEndsAt" TIMESTAMP(3),
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_accounts_pkey" PRIMARY KEY ("restaurantId"),
  CONSTRAINT "agent_accounts_contractStatus_check" CHECK ("contractStatus" IN ('unsigned', 'signed')),
  CONSTRAINT "agent_accounts_agentCode_check" CHECK ("agentCode" ~ '^[A-Z0-9]{4,20}$'),
  CONSTRAINT "agent_accounts_ownerPhone_check" CHECK (length(btrim("ownerPhone")) > 0)
);

DO $$ BEGIN
  ALTER TABLE "agent_accounts" ADD CONSTRAINT "agent_accounts_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- The code is stored uppercase and, once set, never changes: commission is
-- attributed by it, and an edit would quietly move a customer between agents.
CREATE OR REPLACE FUNCTION agent_accounts_code_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW."agentCode" := upper(regexp_replace(NEW."agentCode", '[\s-]+', '', 'g'));
    RETURN NEW;
  END IF;
  IF NEW."agentCode" IS DISTINCT FROM OLD."agentCode" THEN
    RAISE EXCEPTION 'agent code is permanent once set (restaurant %)', OLD."restaurantId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS agent_accounts_code_immutable ON "agent_accounts";
CREATE TRIGGER agent_accounts_code_immutable
  BEFORE INSERT OR UPDATE ON "agent_accounts"
  FOR EACH ROW EXECUTE FUNCTION agent_accounts_code_guard();

-- --------------------------------------------------------------------------
-- product_event_outbox
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_event_outbox" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "eventId"       TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "payload"       JSONB NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastStatus"    INTEGER,
  "lastError"     TEXT,
  "portalStatus"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"        TIMESTAMP(3),
  CONSTRAINT "product_event_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_event_outbox_status_check" CHECK ("status" IN ('pending', 'sent', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "product_event_outbox_eventId_key"
  ON "product_event_outbox" ("eventId");
CREATE INDEX IF NOT EXISTS "product_event_outbox_status_restaurantId_createdAt_idx"
  ON "product_event_outbox" ("status", "restaurantId", "createdAt");
-- One signup event per restaurant, ever: queueing it twice is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS "product_event_outbox_one_signup"
  ON "product_event_outbox" ("restaurantId") WHERE "type" = 'customer.signed_up';

-- The stored eventId and the payload's event_id are the same thing; keep them
-- so, whichever one a writer forgot.
CREATE OR REPLACE FUNCTION product_event_outbox_sync_event_id() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."payload"->>'event_id' IS DISTINCT FROM NEW."eventId" THEN
    NEW."payload" := jsonb_set(NEW."payload", '{event_id}', to_jsonb(NEW."eventId"), true);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS product_event_outbox_event_id ON "product_event_outbox";
CREATE TRIGGER product_event_outbox_event_id
  BEFORE INSERT ON "product_event_outbox"
  FOR EACH ROW EXECUTE FUNCTION product_event_outbox_sync_event_id();

-- --------------------------------------------------------------------------
-- product_callback_inbox — deliberately no FK to restaurants
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "product_callback_inbox" (
  "eventId"    TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "payload"    JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outcome"    TEXT,
  CONSTRAINT "product_callback_inbox_pkey" PRIMARY KEY ("eventId")
);

-- --------------------------------------------------------------------------
-- subscription_manual_payments
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "subscription_manual_payments" (
  "id"                TEXT NOT NULL,
  "restaurantId"      TEXT NOT NULL,
  "type"              TEXT NOT NULL,
  "monthsCovered"     INTEGER NOT NULL DEFAULT 1,
  "billingMonthStart" DATE,
  "amountCentavos"    INTEGER NOT NULL,
  "bankReference"     TEXT NOT NULL,
  "receiptPath"       TEXT,
  "status"            TEXT NOT NULL DEFAULT 'submitted',
  "reason"            TEXT,
  "submittedBy"       TEXT,
  "eventId"           TEXT NOT NULL,
  "submittedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"         TIMESTAMP(3),
  CONSTRAINT "subscription_manual_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_manual_payments_type_check" CHECK ("type" IN ('activation', 'monthly')),
  CONSTRAINT "subscription_manual_payments_status_check"
    CHECK ("status" IN ('submitted', 'confirmed', 'rejected', 'reversed')),
  CONSTRAINT "subscription_manual_payments_months_check" CHECK ("monthsCovered" BETWEEN 1 AND 24),
  CONSTRAINT "subscription_manual_payments_amount_check" CHECK ("amountCentavos" > 0),
  CONSTRAINT "subscription_manual_payments_month_check"
    CHECK ("type" <> 'monthly' OR "billingMonthStart" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_manual_payments_bankReference_key"
  ON "subscription_manual_payments" ("bankReference");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_manual_payments_eventId_key"
  ON "subscription_manual_payments" ("eventId");
CREATE INDEX IF NOT EXISTS "subscription_manual_payments_restaurantId_submittedAt_idx"
  ON "subscription_manual_payments" ("restaurantId", "submittedAt");

DO $$ BEGIN
  ALTER TABLE "subscription_manual_payments" ADD CONSTRAINT "subscription_manual_payments_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- --------------------------------------------------------------------------
-- payment_collection — one platform-wide row
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_collection" (
  "id"        TEXT NOT NULL DEFAULT 'platform',
  "details"   JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_collection_pkey" PRIMARY KEY ("id")
);

-- --------------------------------------------------------------------------
-- Row-level security (matches prisma/rls.sql's FORCE pattern).
--
-- Owners may READ their own agent row and their own receipts (tenantDb runs
-- as app_user with the restaurant set). Every write goes through the server's
-- system transaction. The outbox, inbox and payment details are system-only.
-- The Supabase browser roles get nothing on any of them.
-- --------------------------------------------------------------------------
ALTER TABLE "agent_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "agent_accounts";
CREATE POLICY tenant_read ON "agent_accounts" FOR SELECT
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
DROP POLICY IF EXISTS system_write ON "agent_accounts";
CREATE POLICY system_write ON "agent_accounts" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "subscription_manual_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_manual_payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "subscription_manual_payments";
CREATE POLICY tenant_read ON "subscription_manual_payments" FOR SELECT
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
DROP POLICY IF EXISTS system_write ON "subscription_manual_payments";
CREATE POLICY system_write ON "subscription_manual_payments" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "product_event_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_event_outbox" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_only ON "product_event_outbox";
CREATE POLICY system_only ON "product_event_outbox" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "product_callback_inbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_callback_inbox" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_only ON "product_callback_inbox";
CREATE POLICY system_only ON "product_callback_inbox" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

ALTER TABLE "payment_collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_collection" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_only ON "payment_collection";
CREATE POLICY system_only ON "payment_collection" FOR ALL
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());

GRANT SELECT ON "agent_accounts", "subscription_manual_payments" TO app_user;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_accounts', 'product_event_outbox', 'product_callback_inbox',
                           'subscription_manual_payments', 'payment_collection'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON %I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Check: should list the five tables, each with rls = true.
SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
FROM pg_class c
WHERE c.relname IN ('agent_accounts', 'product_event_outbox', 'product_callback_inbox',
                    'subscription_manual_payments', 'payment_collection')
ORDER BY 1;
