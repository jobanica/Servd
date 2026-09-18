-- Cash advances repaid a little each cutoff.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- A payroll_deductions row is a one-off: it says "take ₱500 this period" and
-- nothing knows it was the third instalment of ₱5,000. The owner had to carry
-- the remaining balance in their head, and nothing stopped a final instalment
-- taking more than was actually left.
--
-- This table is the loan. Each repayment stays an ordinary deduction — so
-- payroll needs no special case and the staff member still sees it on their
-- payslip — and now points back here, which is what makes a balance knowable.

CREATE TABLE IF NOT EXISTS "cash_advances" (
  "id"           TEXT PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  "employeeId"   TEXT NOT NULL,
  "principal"    INTEGER NOT NULL,               -- centavos handed over
  "perPeriod"    INTEGER NOT NULL,               -- centavos to take each cutoff
  "status"       TEXT NOT NULL DEFAULT 'active', -- active | paused | settled | cancelled
  "note"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt"    TIMESTAMP(3),
  CONSTRAINT "cash_advances_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE,
  CONSTRAINT "cash_advances_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "cash_advances_employeeId_idx" ON "cash_advances" ("employeeId");
CREATE INDEX IF NOT EXISTS "cash_advances_restaurantId_status_idx"
  ON "cash_advances" ("restaurantId", "status");

-- Which advance a deduction repaid. Nullable: every existing deduction, and
-- every ordinary one from now on (uniform, breakage), has no advance behind it.
ALTER TABLE "payroll_deductions" ADD COLUMN IF NOT EXISTS "advanceId" TEXT;
CREATE INDEX IF NOT EXISTS "payroll_deductions_advanceId_idx"
  ON "payroll_deductions" ("advanceId");

DO $$ BEGIN
  ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_advanceId_fkey"
    FOREIGN KEY ("advanceId") REFERENCES "cash_advances"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- RLS + app_user grants (matches prisma/rls.sql).
ALTER TABLE "cash_advances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_advances" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "cash_advances";
CREATE POLICY tenant_isolation ON "cash_advances"
  USING (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id())
  WITH CHECK (app.is_super_admin() OR "restaurantId" = app.current_restaurant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "cash_advances" TO app_user;

-- Check it. Expect all true.
SELECT
  to_regclass('public.cash_advances') IS NOT NULL AS table_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='payroll_deductions'
            AND column_name='advanceId')                       AS deduction_link,
  (SELECT is_nullable = 'YES' FROM information_schema.columns
     WHERE table_schema='public' AND table_name='payroll_deductions'
       AND column_name='advanceId')                            AS link_is_nullable;

-- Outstanding balances, once there are some. Derived from the repayments
-- rather than a stored total, so it can never drift from the deductions that
-- actually came off someone's pay.
SELECT e."fullName",
       a."principal",
       coalesce(sum(d."amount"), 0)                     AS repaid,
       a."principal" - coalesce(sum(d."amount"), 0)     AS still_owed,
       a."status"
FROM "cash_advances" a
JOIN "employees" e ON e."id" = a."employeeId"
LEFT JOIN "payroll_deductions" d ON d."advanceId" = a."id"
GROUP BY e."fullName", a."id", a."principal", a."status"
ORDER BY still_owed DESC;
