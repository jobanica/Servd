-- ============================================================================
-- Direct signups through the agent portal (no agent).
--
-- Every self-signup on servdph.com now activates by paying the CANVEXIA
-- portal by QR, agent or not. agent_accounts therefore holds every
-- portal-billed restaurant, and agentCode is NULL for one that came without
-- an agent. Run BEFORE the code that uses it is deployed. Idempotent.
--
-- Existing data is untouched: the table has no rows with a NULL code, and the
-- code stays permanent once set.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

ALTER TABLE "agent_accounts" ALTER COLUMN "agentCode" DROP NOT NULL;

-- Uppercase whenever a code is written. A code may go from NULL to a value
-- once; once it has a value it never changes.
CREATE OR REPLACE FUNCTION agent_accounts_code_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."agentCode" IS NOT NULL THEN
    NEW."agentCode" := upper(regexp_replace(NEW."agentCode", '[\s-]+', '', 'g'));
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."agentCode" IS NOT NULL
     AND NEW."agentCode" IS DISTINCT FROM OLD."agentCode" THEN
    RAISE EXCEPTION 'agent code is permanent once set (restaurant %)', OLD."restaurantId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

COMMIT;

-- Check: is_nullable should be YES.
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_name = 'agent_accounts' AND column_name = 'agentCode';
