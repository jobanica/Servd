import "server-only";
import { cookies } from "next/headers";
import { systemDb } from "@/server/tenancy/scoped-db";
import { ATTRIBUTION_COOKIE, decodeAttribution, type SourceChannel } from "@/lib/neighborhood/commission";

/**
 * Tag a just-placed order with where it came from — for measuring a magnet
 * campaign, never for deciding commission (every platform order of a
 * neighborhood partner owes it, whatever the channel).
 *
 * One guarded statement: it writes only when the restaurant is on the
 * neighborhood track, so a standard account's order is left exactly as it
 * was. Runs after the order is created and swallows every error — attribution
 * can never fail, slow or undo a customer's order.
 */
export async function recordOrderAttribution(orderId: string, fallback: SourceChannel): Promise<void> {
  try {
    let channel: SourceChannel = fallback;
    let territoryId: string | null = null;
    if (fallback !== "table_qr") {
      const a = decodeAttribution((await cookies()).get(ATTRIBUTION_COOKIE)?.value);
      if (a) {
        channel = a.sourceChannel;
        territoryId = a.territoryId;
      }
    }
    await systemDb((tx) =>
      tx.$executeRaw`
        UPDATE "orders" SET "sourceChannel" = ${channel}, "territoryId" = ${territoryId}
         WHERE "id" = ${orderId}
           AND EXISTS (SELECT 1 FROM "restaurants" r
                        WHERE r."id" = "orders"."restaurantId" AND r."commercialTrack" = 'neighborhood')`,
    );
  } catch {
    /* attribution is a measurement; the order stands without it */
  }
}
