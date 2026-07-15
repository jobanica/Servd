-- Advance table booking from the online website. Customers pick a date/time on
-- the storefront and it lands in Reservations. Two small, idempotent additions:
--   1. storefront_settings.acceptsBookings — the admin's on/off switch.
--   2. reservations.source — marks a booking as self-served from the website.
-- The reservations table itself comes from add-reservations.sql — run that too
-- if you haven't. Run in the Supabase SQL editor. Idempotent.

ALTER TABLE "storefront_settings"
  ADD COLUMN IF NOT EXISTS "acceptsBookings" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "reservations"
  ADD COLUMN IF NOT EXISTS "source" TEXT;
