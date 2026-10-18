-- The Rider app's record of each delivery: who took it, when it left and
-- arrived, how the rider was paid at the door and how much, and the GCash
-- receipt photo (a path in the PRIVATE rider-receipts bucket). All nullable,
-- no defaults. Idempotent. (Applied 2026-10-18.)
SET lock_timeout = '5s';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "riderId" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "riderPickedUpAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "riderPayMethod" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "riderCollected" INTEGER;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "riderReceiptPath" TEXT;
