-- Hide a whole category from the online ordering website (the table QR menu
-- and the cashier still show it). NOT NULL DEFAULT false is a metadata-only
-- change on Postgres 11+, and every existing category stays visible.
-- Idempotent. (Applied 2026-10-22.)
SET lock_timeout = '5s';
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "hideOnline" BOOLEAN NOT NULL DEFAULT false;
