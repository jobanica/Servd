-- Promotions limited to online orders or to dine-in. Nullable, no default:
-- every existing promotion stays usable everywhere (null). Idempotent.
-- (Applied 2026-10-16.)
SET lock_timeout = '5s';
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "channel" TEXT;
