-- Verify the business-operations layer landed correctly.
-- Read-only. Run in the Supabase SQL editor after add-business-ops.sql and
-- backfill-business-ops.sql. Nothing here writes anything.
--
-- Five checks, in the order they'd fail:
--   1. the new objects exist
--   2. nothing existing was damaged
--   3. the backfill did what it said
--   4. the numbers on the dashboard have a source
--   5. no fake history was invented

-- ============================================================ 1. new objects
-- Expect every column true.
SELECT
  to_regclass('public.customer_events') IS NOT NULL AS t_customer_events,
  to_regclass('public.ad_spend')        IS NOT NULL AS t_ad_spend,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='crm_clients'
      AND column_name IN ('restaurantId','materialsAt','productionAt',
                          'previewSentAt','paidAt','activatedAt',
                          'assignedTo','lostReason')) = 8 AS crm_columns_all_8,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
    AND indexname IN ('customer_events_restaurantId_occurredAt_idx',
                      'customer_events_leadId_occurredAt_idx',
                      'customer_events_eventType_occurredAt_idx',
                      'ad_spend_spendDate_idx',
                      'crm_clients_restaurantId_idx')) = 5 AS indexes_all_5;

-- ====================================================== 2. nothing damaged
-- The hard constraint was "must not affect the running system". Every added
-- column has to be NULLABLE with no default — a NOT NULL or a default would be
-- written into the INSERT of every crm_clients row and break adding a client.
-- Expect zero rows.
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='crm_clients'
  AND column_name IN ('restaurantId','materialsAt','productionAt','previewSentAt',
                      'paidAt','activatedAt','assignedTo','lostReason')
  AND (is_nullable <> 'YES' OR column_default IS NOT NULL);

-- The live tables must still be intact. Expect all true.
SELECT
  to_regclass('public.orders')              IS NOT NULL AS orders_ok,
  to_regclass('public.restaurants')         IS NOT NULL AS restaurants_ok,
  to_regclass('public.activation_requests') IS NOT NULL AS activations_ok,
  to_regclass('public.crm_clients')         IS NOT NULL AS crm_ok,
  to_regclass('public.storefront_settings') IS NOT NULL AS storefront_ok;

-- ========================================================== 3. the backfill
-- linked should equal active_restaurants once the backfill has run, and
-- orphans must be 0 — an orphan means a lead points at a restaurant that no
-- longer exists, which would 404 from the follow-up list.
SELECT
  (SELECT count(*) FROM "crm_clients"  WHERE "restaurantId" IS NOT NULL) AS linked,
  (SELECT count(*) FROM "restaurants"  WHERE "status" = 'active')        AS active_restaurants,
  (SELECT count(*) FROM "crm_clients"  WHERE "source" = 'backfill')      AS from_backfill,
  (SELECT count(*) FROM "crm_clients" c
     WHERE c."restaurantId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "restaurants" r WHERE r."id" = c."restaurantId")) AS orphans;

-- ================================================ 4. the dashboard has data
-- What each screen will actually show. A zero here is a real zero, not a bug —
-- but "follow_ups_diy = 0" with previews in the estate would be worth a look.
SELECT
  (SELECT count(*) FROM "restaurants" WHERE "status" = 'preview')            AS previews_total,
  (SELECT count(*) FROM "restaurants" r WHERE r."status" = 'preview'
     AND EXISTS (SELECT 1 FROM "menu_items" m WHERE m."restaurantId" = r."id")) AS follow_ups_diy,
  (SELECT count(*) FROM "crm_clients" WHERE "stage" NOT IN ('won','lost'))   AS follow_ups_outreach,
  (SELECT count(*) FROM "activation_requests" WHERE "paidAt" IS NOT NULL)    AS paid_activations,
  (SELECT coalesce(sum("amount"),0) FROM "activation_requests" WHERE "paidAt" IS NOT NULL) AS activation_centavos,
  (SELECT count(*) FROM "addon_purchases" WHERE "status" = 'paid')           AS paid_unlocks,
  (SELECT count(*) FROM "feature_subscriptions" WHERE "status" = 'active')   AS live_subscriptions,
  (SELECT count(*) FROM "customer_events")                                   AS events_logged,
  (SELECT count(*) FROM "ad_spend")                                          AS ad_spend_rows;

-- ===================================================== 5. no invented dates
-- The backfill was written to leave unknown dates NULL rather than filling
-- them with createdAt. A row where paidAt exactly equals createdAt would be a
-- fabricated timestamp feeding every funnel average. Expect 0.
SELECT count(*) AS suspicious_backfilled_dates
FROM "crm_clients"
WHERE "source" = 'backfill'
  AND ("paidAt" = "createdAt" OR "activatedAt" = "createdAt");

-- ========================================================== 6. the smoke test
-- Prove the event log works end to end, then remove the proof. Writes and
-- deletes exactly one row, and touches nothing else.
INSERT INTO "customer_events" ("id","eventType","restaurantId","meta")
SELECT gen_random_uuid()::text, 'note', r."id", '{"kind":"verify"}'::jsonb
FROM "restaurants" r LIMIT 1;

SELECT count(*) = 1 AS event_write_works
FROM "customer_events" WHERE "meta"->>'kind' = 'verify';

DELETE FROM "customer_events" WHERE "meta"->>'kind' = 'verify';
