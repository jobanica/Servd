-- The revolving fund: what the cashier puts in the drawer when opening a shift.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- "Expected in drawer" was cash taken minus cash removed, which is not what is
-- in the drawer — it leaves out the float the shift started with. A cashier
-- who opened with ₱1,000 and took ₱3,000 has ₱4,000 in front of them and a
-- report telling them they should have ₱3,000. Counting the fund at the start
-- is what makes the end-of-shift figure checkable.
--
-- Nullable with NO default, and null is deliberately not zero: it means the
-- shift was opened before anyone was asked, which is every shift that already
-- exists. The summary prints "not counted" for those rather than asserting the
-- drawer started empty and handing someone a variance they can't explain.

ALTER TABLE "cashier_shifts" ADD COLUMN IF NOT EXISTS "openingFloat" INTEGER;

-- Check it. Expect exists = true, has_default = false, nullable = true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='cashier_shifts'
            AND column_name='openingFloat')                        AS col_exists,
  (SELECT column_default IS NOT NULL FROM information_schema.columns
     WHERE table_schema='public' AND table_name='cashier_shifts'
       AND column_name='openingFloat')                             AS has_default,
  (SELECT is_nullable = 'YES' FROM information_schema.columns
     WHERE table_schema='public' AND table_name='cashier_shifts'
       AND column_name='openingFloat')                             AS nullable;

-- Shifts opened since, and what each started with. Nulls here are shifts from
-- before the change (or opened by a path that never asked) — expected, not a
-- fault.
SELECT r."name" AS restaurant,
       s."staffName",
       s."openedAt",
       s."status",
       s."openingFloat" / 100.0 AS fund_pesos
FROM "cashier_shifts" s
JOIN "restaurants" r ON r."id" = s."restaurantId"
ORDER BY s."openedAt" DESC
LIMIT 25;
