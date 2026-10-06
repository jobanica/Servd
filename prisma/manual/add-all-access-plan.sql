-- The ₱800/month All Access plan, for accounts created from now on.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- This INSERTS ONE NEW ROW and changes nothing else. That is the whole of how
-- existing accounts are grandfathered: every restaurant already has its own
-- subscription pointing at its own plan (Free, Growth, Business, Lite), and
-- none of those rows is touched here. Editing an existing plan would change
-- the price and features of every account on it at once — so this never does.
--
-- Fixed id (…a8) so the code finds it by id. Several older paths identify a
-- plan by its NAME, and a price can be edited, so neither is safe to key on.
--
-- Explicit feature list: every feature except the Content Calendar
-- (contentScheduler), which stays its own monthly subscription. A plan with an
-- unrecognised name and an EMPTY list unlocks everything, so the list must be
-- written here, in the same statement that creates the plan.
--
-- Price sits below Business (₱1,799) and above Free (₱0), so the helpers that
-- pick "the cheapest" and "the most expensive" active plan pick exactly what
-- they picked before.

INSERT INTO "plans" ("id", "name", "priceMonthly", "limits", "features", "trialDays", "isActive", "createdAt")
VALUES (
  '00000000-0000-0000-0000-0000000000a8',
  'All Access',
  80000,                     -- ₱800 a month, in centavos
  '{}'::jsonb,               -- no table/staff caps; SMS is metered by credits
  ARRAY[
    'onlineOrdering','onlinePayments','loyalty','promotions','customers','sms',
    'aiMenuImport','floorPlan','giftCards','reservations','dataExport','auditLog',
    'offline','accounting','inventory','hr','customDomain','whiteLabel',
    'unlimitedTables'
  ]::text[],
  30,
  true,
  now()
)
ON CONFLICT ("id") DO NOTHING;

-- Check it. Expect one row: All Access, 80000, 19 features, no contentScheduler.
SELECT "id", "name", "priceMonthly",
       cardinality("features")                    AS feature_count,
       'contentScheduler' = ANY("features")       AS includes_content_calendar,
       "isActive"
FROM "plans" WHERE "id" = '00000000-0000-0000-0000-0000000000a8';

-- And the proof nobody moved: how many restaurants are on each plan. Run it
-- before and after — the existing plans' counts must not change, and All
-- Access starts at zero.
SELECT p."name", p."priceMonthly" / 100 AS pesos, count(s."id") AS subscriptions
FROM "plans" p
LEFT JOIN "subscriptions" s ON s."planId" = p."id"
GROUP BY p."id", p."name", p."priceMonthly"
ORDER BY p."priceMonthly";

-- ---------------------------------------------------------------------------
-- The follow-up emails sent to people who built a preview but haven't gone
-- live. They are stored in email_templates (seeded once from the code, then
-- editable in Super-admin → Email follow-up), so changing the code alone
-- would leave prospects being promised "₱499 one-time, yours for life" —
-- and arriving at a free trial that becomes ₱800 a month.
--
-- Here, in the same file as the plan, so the emails change at the moment the
-- new pricing does, not before.
--
-- Sentence-level replace(), not an overwrite: only the exact ₱499 sentences
-- are swapped. Anything you've edited elsewhere in these emails survives, and
-- if you rewrote one of these sentences yourself, replace() finds nothing and
-- leaves it — the check below lists whatever still mentions ₱499 so you can
-- fix those by hand.
-- ---------------------------------------------------------------------------

UPDATE "email_templates"
SET "body" = replace("body",
  'Para tanggapin ang totoong orders, activate mo na — ₱499 one-time, sa''yo na habambuhay.',
  'Para tanggapin ang totoong orders, i-live mo na — libre ang unang 30 araw, tapos ₱800 kada buwan.'),
    "updatedAt" = now()
WHERE "stepKey" = 'B_immediate';

UPDATE "email_templates"
SET "body" = replace("body",
  '₱499 one-time, tapos sa''yo na ang {{name}} page habambuhay.',
  'Libre ang unang 30 araw, tapos ₱800 kada buwan — kasama na ang POS, kitchen display, inventory at HR.'),
    "updatedAt" = now()
WHERE "stepKey" = 'B_day3';

UPDATE "email_templates"
SET "subject" = replace("subject",
      'Activate na? ₱499 lang, one-time',
      'I-live na? Libre ang unang 30 araw'),
    "body" = replace("body",
      'Simple lang: ₱499 one-time, live agad ang {{name}}.',
      'Simple lang: i-live mo ngayon ang {{name}} — libre ng 30 araw, tapos ₱800 kada buwan.'),
    "updatedAt" = now()
WHERE "stepKey" = 'B_day7';

-- Anything still promising the old price. Empty is the goal; any row here was
-- edited by hand and needs the same change made by hand.
SELECT "stepKey", "subject", left("body", 120) AS body_start
FROM "email_templates"
WHERE "subject" LIKE '%499%' OR "body" LIKE '%499%';
