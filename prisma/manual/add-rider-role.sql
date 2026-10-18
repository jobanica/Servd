-- The Rider staff role: a login that opens only the Rider app (/rider).
-- ADD VALUE can't run inside a transaction block: run this statement on its
-- own. Idempotent. (Applied 2026-10-18.)
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'rider';
