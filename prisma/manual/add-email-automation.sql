-- Automated follow-up: a drip sequence that fires N days after someone creates
-- a DIY preview, and stops on its own once they activate.
--
-- Run in the Supabase SQL editor. Idempotent.
-- Requires add-email-marketing.sql first.

-- Master switch, off until the founder turns it on.
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "emailAutomationOn" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "email_automation_steps" (
  "id"        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "dayOffset" INTEGER NOT NULL,
  "subject"   TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "email_automation_steps_enabled_dayOffset_idx"
  ON "email_automation_steps" ("enabled", "dayOffset");

CREATE TABLE IF NOT EXISTS "email_automation_sends" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "stepId"       TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'sent',
  "error"        TEXT,
  "sentAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_automation_sends_stepId_fkey'
  ) THEN
    ALTER TABLE "email_automation_sends"
      ADD CONSTRAINT "email_automation_sends_stepId_fkey"
      FOREIGN KEY ("stepId") REFERENCES "email_automation_steps"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- THE no-double-send guarantee. One row per (step, lead), enforced by the
-- database rather than by the runner remembering — so a re-run, an overlapping
-- run, or a retry can never send the same follow-up twice.
CREATE UNIQUE INDEX IF NOT EXISTS "email_automation_sends_stepId_restaurantId_key"
  ON "email_automation_sends" ("stepId", "restaurantId");
CREATE INDEX IF NOT EXISTS "email_automation_sends_restaurantId_idx"
  ON "email_automation_sends" ("restaurantId");

-- Platform-level: super-admin only, like the campaign tables.
ALTER TABLE "email_automation_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_automation_steps" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "email_automation_steps";
CREATE POLICY super_only ON "email_automation_steps"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_automation_steps" TO app_user;

ALTER TABLE "email_automation_sends" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_automation_sends" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS super_only ON "email_automation_sends";
CREATE POLICY super_only ON "email_automation_sends"
  USING (app.is_super_admin()) WITH CHECK (app.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_automation_sends" TO app_user;
