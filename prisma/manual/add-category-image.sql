-- Category photos for the menu's category tabs. Nullable, no default:
-- existing categories are untouched (null = the first dish photo stands in).
-- Idempotent. (Applied 2026-10-12.)
SET lock_timeout = '5s';
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
