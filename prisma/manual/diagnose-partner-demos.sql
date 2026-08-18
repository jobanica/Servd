-- ============================================================================
-- READ-ONLY. Changes nothing. Safe to run any time.
-- ============================================================================
--
-- "The partner can't see the Convert button." This tells you why. Run the
-- whole file and read the four results in order.
-- ============================================================================

-- 1. Are the two columns the partner portal needs actually here?
--    Both ship in manual migrations: add-demo-partner.sql, add-staff-username.sql.
--    A missing demoPartnerId means the portal lists NOTHING at all.
SELECT 'restaurants.demoPartnerId' AS column_needed,
       to_regclass('public.restaurants') IS NOT NULL AS table_exists,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'restaurants' AND column_name = 'demoPartnerId'
       ) AS column_exists
UNION ALL
SELECT 'staff_users.username',
       to_regclass('public.staff_users') IS NOT NULL,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'staff_users' AND column_name = 'username'
       );

-- 2. Which partners exist, and are they approved? An unapproved partner sees
--    the "application under review" screen instead of a dashboard.
SELECT id, name, email, status, tier, "createdAt"
FROM partners
ORDER BY "createdAt" DESC;

-- 3. Every storefront, and who it belongs to.
--    demo_partner IS NULL  → built from super-admin. NO partner can see it,
--                            so no partner can convert it.
--    has_login = true      → already a real account; the button is gone by
--                            design (it's been converted already).
SELECT r.name,
       r.slug,
       r.status,
       r."demoPartnerId" AS demo_partner,
       p.name            AS partner_name,
       EXISTS (SELECT 1 FROM staff_users s WHERE s."restaurantId" = r.id) AS has_login,
       r."createdAt"
FROM restaurants r
LEFT JOIN partners p ON p.id = r."demoPartnerId"
ORDER BY r."createdAt" DESC
LIMIT 50;

-- 4. The summary that answers the question directly: per partner, how many of
--    their storefronts SHOULD be showing a Convert button right now.
SELECT p.name AS partner,
       p.status,
       count(r.id) AS storefronts,
       count(r.id) FILTER (
         WHERE NOT EXISTS (SELECT 1 FROM staff_users s WHERE s."restaurantId" = r.id)
       ) AS awaiting_convert
FROM partners p
LEFT JOIN restaurants r ON r."demoPartnerId" = p.id
GROUP BY p.name, p.status
ORDER BY p.name;
