import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { normalizePaymentDetails, type PaymentDetails } from "@/server/agent-portal/billing";

/**
 * Where neighborhood partners send their weekly commission: Servd's bank QR
 * plus account details. Its own row in payment_collection ("neighborhood"),
 * apart from the agent portal's ("platform"), so changing one never changes
 * the other.
 */
export const NEIGHBORHOOD_PAYMENT_ROW = "neighborhood";

export async function getCommissionPaymentDetails(): Promise<PaymentDetails> {
  try {
    const row = await systemDb((tx) =>
      tx.paymentCollection.findUnique({ where: { id: NEIGHBORHOOD_PAYMENT_ROW }, select: { details: true } }),
    );
    return normalizePaymentDetails(row?.details);
  } catch {
    return normalizePaymentDetails(null);
  }
}
