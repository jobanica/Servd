-- A photo for each promotion, shown on the ordering website and the table
-- menu's Promos sheet. Nullable, no default. Idempotent. (Applied 2026-10-16.)
SET lock_timeout = '5s';
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
