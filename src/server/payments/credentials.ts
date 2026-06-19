import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { decryptJson } from "@/lib/crypto/secrets";
import { PayMongoGateway } from "./paymongo";
import { XenditGateway } from "./xendit";
import type { PaymentGateway } from "./gateway";

interface StoredCredentials {
  secretKey: string;
  webhookSecret: string;
}

/**
 * Builds a PaymentGateway for a restaurant from its encrypted credentials.
 * Returns null if online payment isn't enabled/configured. Used by both the
 * public checkout action and the webhook handler, so it runs in systemDb scoped
 * by restaurantId.
 */
export async function getRestaurantGateway(
  restaurantId: string,
): Promise<PaymentGateway | null> {
  const restaurant = await systemDb((tx) =>
    tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        paymentGateway: true,
        paymentCredentialsEnc: true,
        paymentOnlineEnabled: true,
      },
    }),
  );
  if (!restaurant?.paymentOnlineEnabled || !restaurant.paymentCredentialsEnc) {
    return null;
  }

  const creds = decryptJson<StoredCredentials>(restaurant.paymentCredentialsEnc);
  if (!creds.secretKey || !creds.webhookSecret) return null;

  switch (restaurant.paymentGateway) {
    case "paymongo":
      return new PayMongoGateway(creds.secretKey, creds.webhookSecret);
    case "xendit":
      return new XenditGateway(creds.secretKey, creds.webhookSecret);
    default:
      return null;
  }
}
