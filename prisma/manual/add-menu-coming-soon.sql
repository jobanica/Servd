-- "Available soon" menu items: shown to diners under their own button in the
-- menu, not orderable yet. Nullable, no default: existing items are untouched
-- (null = a normal item). Idempotent. (Applied 2026-10-09.)
SET lock_timeout = '5s';
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "comingSoon" BOOLEAN;
