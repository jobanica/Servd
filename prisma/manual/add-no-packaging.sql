-- Menu items that carry no packaging fee (drinks, and anything else that
-- arrives in its own container).
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- The packaging fee used to be charged on every unit in the cart, so a
-- ₱10-per-item fee on an order of two silogs and three bottled softdrinks
-- charged ₱50 for three tubs. This column marks the ones that need no tub.
--
-- Nullable with NO default, deliberately. A DEFAULT would be written into the
-- INSERT of every menu item created by code that predates this migration, and
-- Prisma returns all scalar columns on a select-less query — a column the
-- database lacks takes down the menu editor entirely. Null means false: a
-- restaurant that never ticks a box keeps charging exactly what it charges now.

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "noPackaging" BOOLEAN;

-- Check it. Expect exists = true, has_default = false, nullable = true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'menu_items'
            AND column_name = 'noPackaging')                       AS exists,
  (SELECT column_default IS NOT NULL FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'menu_items'
       AND column_name = 'noPackaging')                            AS has_default,
  (SELECT is_nullable = 'YES' FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'menu_items'
       AND column_name = 'noPackaging')                            AS nullable;

-- Which items are exempt, once some are. Nothing here right after the migration
-- is the correct result — the owner ticks the boxes in Settings → Storefront.
SELECT r."name" AS restaurant, c."name" AS category, m."name" AS item
FROM "menu_items" m
JOIN "categories" c  ON c."id" = m."categoryId"
JOIN "restaurants" r ON r."id" = m."restaurantId"
WHERE m."noPackaging" IS TRUE
ORDER BY r."name", c."name", m."name";
