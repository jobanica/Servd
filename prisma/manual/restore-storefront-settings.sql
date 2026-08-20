-- ============================================================================
-- Putting a wiped storefront configuration back.
-- ============================================================================
--
-- The overwrite replaced the JSON in storefront_settings with defaults. The old
-- values are not in the database any more — nothing versions those columns — so
-- they can only come from a BACKUP. This file is the safe way to move them
-- across once you have one.
--
-- DO NOT restore the whole database over the live one. That would also roll
-- back every order, payment and shift taken since the backup, which is a bigger
-- loss than the settings. Restore the backup into a SEPARATE project, pull just
-- these rows out of it, and apply them here.
--
-- ---------------------------------------------------------------------------
-- STEP 1 — in Supabase: Database → Backups. Restore a snapshot from BEFORE the
-- overwrite into a new project (Restore → to a new project). Daily backups are
-- available on Pro; if you have PITR, pick a timestamp an hour before the
-- client reported it.
--
-- STEP 2 — run this in the RESTORED copy. It prints ready-made UPDATE
-- statements. Copy the output.
-- ---------------------------------------------------------------------------
SELECT format(
  'UPDATE storefront_settings SET "hours" = %L, "deliveryZones" = %L, "paymentConfig" = %L, "bookingConfig" = %L, "deliveryConfig" = %L, "acceptsBookings" = %L WHERE "restaurantId" = (SELECT id FROM restaurants WHERE slug = %L);',
  s."hours",
  s."deliveryZones",
  s."paymentConfig",
  s."bookingConfig",
  s."deliveryConfig",
  s."acceptsBookings",
  r.slug
) AS restore_statement
FROM storefront_settings s
JOIN restaurants r ON r.id = s."restaurantId"
-- Narrow this to the shops that actually lost settings. Add more slugs as
-- check-storefront-settings.sql turns them up.
WHERE r.slug IN ('put-the-slug-here', 'and-another')
ORDER BY r.slug;

-- ---------------------------------------------------------------------------
-- STEP 3 — run the printed statements in the LIVE project.
--
-- Matched on slug rather than id: ids are identical across a restored copy, but
-- slug is the thing a human can eyeball and confirm is the right shop before
-- pasting an UPDATE into production.
--
-- STEP 4 — verify. Re-run check-storefront-settings.sql; the restored shops
-- should no longer report looks_wiped, and the owner should see their GCash,
-- Maya, bank and delivery pricing back on the settings page.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- No backup? Then these values have to be re-entered by hand, and the honest
-- thing is to say so and help the owner do it rather than keep looking. Before
-- re-entering, confirm the app has the fix deployed and that
-- check-storefront-settings.sql reports orders_paused_column — otherwise the
-- work could be lost a second time.
-- ---------------------------------------------------------------------------
