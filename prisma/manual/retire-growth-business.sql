-- Take Growth and Business off sale. All Access (₱800/month) is the only plan
-- a new account can be put on.
-- Run in the Supabase SQL editor AFTER the code that ships with it is live.
-- Safe to re-run. Reversible: set "isActive" back to true.
--
-- RETIRED, NOT DELETED. 3 accounts are on Growth and 327 on Business. Deleting
-- the rows would break their subscriptions, and moving them would break the
-- promise that existing accounts are grandfathered. So the plans stay, with
-- everyone on them, and simply can't be assigned to anyone else:
--
--   - The feature gate never reads "isActive", so nobody on these plans loses
--     a single feature.
--   - The billing run reads each subscription's own plan and price, so they
--     are billed (and trial out to FREE) exactly as before.
--   - The super-admin plan picker lists active plans only, so these vanish
--     from it — except on the accounts already on them, which still show
--     their own plan, marked retired, so pressing Assign can't silently
--     downgrade them.
--   - The "most expensive active plan" becomes All Access. That is what demo
--     storefronts are provisioned on, so demos now run on All Access — the
--     plan they convert into anyway.
--
-- FREE stays active on purpose. The billing run falls back to it when an old
-- trial ends, partner-converted restaurants land on it, and ₱499 branch
-- activations are provisioned on it. Retiring it would change what happens to
-- every grandfathered account whose trial runs out.

UPDATE "plans"
SET "isActive" = false
WHERE "id" IN (
  '00000000-0000-0000-0000-0000000000a2',  -- Growth
  '00000000-0000-0000-0000-0000000000a3'   -- Business
);

-- Check it. Expect: FREE active, All Access active, Growth and Business
-- retired — with their subscriber counts unchanged.
SELECT p."name", p."priceMonthly" / 100 AS pesos, p."isActive",
       count(s."id") AS subscriptions
FROM "plans" p
LEFT JOIN "subscriptions" s ON s."planId" = p."id"
GROUP BY p."id", p."name", p."priceMonthly", p."isActive"
ORDER BY p."priceMonthly";
