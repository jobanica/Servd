-- Scoped back-office roles. Run in the Supabase SQL editor. Safe to re-run.
--
-- /super-admin used to be one binary door: hold a platform_admins row and you
-- could change what Servd charges, read every restaurant's data, and email all
-- of them. That is right for the founder and wrong for somebody hired to work
-- the pipeline.
--
-- NULL means full access, so every admin that already exists keeps exactly
-- what they have and no data migration is needed. Only a row that explicitly
-- says 'ops' is restricted.
--
-- Nullable with NO default, like every other column added this way: a default
-- is a value Prisma writes into the INSERT of every admin row, and it would
-- break creating one on a database that hasn't run this file.

ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "role" TEXT;

-- Check it. Expect true.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'platform_admins' AND column_name = 'role'
) AS role_column;

-- Who has what. NULL role = full access.
SELECT "email", coalesce("role", 'owner (full access)') AS scope, "createdAt"
FROM "platform_admins" ORDER BY "createdAt";
