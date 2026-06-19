import "server-only";
import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { generateCode, normalizeCode } from "@/lib/referrals/rules";

export interface ResolvedCode {
  id: string;
  ownerType: string;
  restaurantId: string | null;
  partnerId: string | null;
  active: boolean;
}

/**
 * The restaurant's own referral code, creating one on first use. Runs in the
 * restaurant's RLS scope (it only ever touches its own row).
 */
export async function getOrCreateRestaurantReferralCode(
  restaurantId: string,
): Promise<string> {
  return tenantDb(restaurantId, async (tx) => {
    const existing = await tx.referralCode.findFirst({
      where: { restaurantId, ownerType: "restaurant" },
      select: { code: true },
    });
    if (existing) return existing.code;

    // Generate a unique code, retrying on the (rare) collision.
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = generateCode();
      try {
        await tx.referralCode.create({
          data: { code, ownerType: "restaurant", restaurantId },
        });
        return code;
      } catch {
        // unique violation → try another code
      }
    }
    throw new Error("Could not generate a referral code.");
  });
}

/** Resolve a code value to its owner (cross-tenant; used at signup). */
export async function resolveCode(codeValue: string): Promise<ResolvedCode | null> {
  const code = normalizeCode(codeValue);
  if (!code) return null;
  try {
    const row = await systemDb((tx) =>
      tx.referralCode.findUnique({
        where: { code },
        select: { id: true, ownerType: true, restaurantId: true, partnerId: true, active: true },
      }),
    );
    return row ?? null;
  } catch {
    return null;
  }
}
