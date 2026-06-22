import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Public, diner-facing restaurant lookup by slug. Diners have no session, so we
 * resolve in the trusted system context — but we SELECT ONLY diner-safe fields
 * (never payment credentials, SMS balance, etc.). Returns null if not found or
 * not active.
 */
export async function getPublicRestaurantBySlug(slug: string) {
  return systemDb((tx) =>
    tx.restaurant.findFirst({
      where: { slug, status: "active" },
      select: {
        id: true,
        name: true,
        slug: true,
        displayName: true,
        logoUrl: true,
        coverImageUrl: true,
        tagline: true,
        brandPrimaryColor: true,
        brandAccentColor: true,
        paymentOnlineEnabled: true,
        googleReviewUrl: true,
        feedbackMode: true,
      },
    }),
  );
}

/** Validates a table token belongs to the restaurant. Returns the table or null. */
export async function getTableByToken(restaurantId: string, qrToken: string) {
  const table = await systemDb((tx) =>
    tx.table.findFirst({
      where: { restaurantId, qrToken },
      select: { id: true, tableNumber: true },
    }),
  );
  if (!table) return null;
  // isCounter may not exist yet on a lagging DB — read it best-effort.
  let isCounter = false;
  try {
    const c = await systemDb((tx) =>
      tx.table.findFirst({ where: { id: table.id }, select: { isCounter: true } }),
    );
    isCounter = c?.isCounter ?? false;
  } catch {
    /* column not migrated yet */
  }
  return { ...table, isCounter };
}
