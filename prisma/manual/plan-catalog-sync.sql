-- Align the live plan catalog (prices, limits, add-on module entitlements) with
-- src/lib/billing/catalog.ts. Run in the Supabase SQL editor. Safe to re-run.
--
-- Tiers: Starter (essentials) → Business (every feature) → Pro (+ custom domain).

-- 1) Prices + limits ---------------------------------------------------------
UPDATE "plans" SET "priceMonthly" = 199900,
  "limits" = '{"maxTables":10,"maxStaff":5,"smsIncluded":0}'::jsonb
  WHERE "name" = 'Starter';

UPDATE "plans" SET "priceMonthly" = 299900,
  "limits" = '{"maxTables":30,"maxStaff":20,"smsIncluded":200}'::jsonb
  WHERE "name" = 'Business';

UPDATE "plans" SET "priceMonthly" = 499900,
  "limits" = '{"smsIncluded":1000}'::jsonb  -- unlimited tables & staff
  WHERE "name" = 'Pro';

-- 2) Module entitlements -----------------------------------------------------
-- Business = inventory + HR (no custom domain)
INSERT INTO "plan_modules" ("planId","module","enabled")
SELECT p.id, m.module, true
FROM "plans" p
CROSS JOIN (VALUES ('inventory'::"PlanModuleType"), ('hris'::"PlanModuleType")) AS m(module)
WHERE p."name" = 'Business'
ON CONFLICT ("planId","module") DO UPDATE SET "enabled" = true;

UPDATE "plan_modules" SET "enabled" = false
WHERE "module" = 'custom_domain'
  AND "planId" IN (SELECT id FROM "plans" WHERE "name" = 'Business');

-- Pro = inventory + HR + custom domain (everything)
INSERT INTO "plan_modules" ("planId","module","enabled")
SELECT p.id, m.module, true
FROM "plans" p
CROSS JOIN (VALUES
  ('inventory'::"PlanModuleType"),
  ('hris'::"PlanModuleType"),
  ('custom_domain'::"PlanModuleType")
) AS m(module)
WHERE p."name" = 'Pro'
ON CONFLICT ("planId","module") DO UPDATE SET "enabled" = true;

-- Starter = no add-on modules
UPDATE "plan_modules" SET "enabled" = false
WHERE "planId" IN (SELECT id FROM "plans" WHERE "name" = 'Starter');
