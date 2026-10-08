-- Delivery batches: the delivery run (e.g. 11:00-11:30 AM) a customer picked
-- at checkout, so the Orders app can group orders by batch for the rider.
-- Run in the Supabase SQL editor AFTER the deploy is live. Safe to re-run.
-- Both columns are nullable with no default: existing orders are untouched
-- (null = not a batch order), and no row is rewritten.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryWindowStart" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryWindowEnd"   TIMESTAMP(3);

-- Check: should return both column names.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name IN ('deliveryWindowStart', 'deliveryWindowEnd');
