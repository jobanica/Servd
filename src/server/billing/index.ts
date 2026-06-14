import "server-only";
import { PayMongoBillingProvider } from "./paymongo";
import type { BillingProvider } from "./provider";

/**
 * The platform's billing provider (charges restaurants for their subscription).
 * Uses the PLATFORM PayMongo keys. Returns null if not configured.
 */
export function getBillingProvider(): BillingProvider | null {
  const key = process.env.PAYMONGO_SECRET_KEY;
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!key || !webhookSecret) return null;
  return new PayMongoBillingProvider(key, webhookSecret);
}
