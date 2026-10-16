import "server-only";
import { hasFeature } from "@/server/billing/feature-gate";
import { getActivePromotions } from "@/server/promotions/queries";
import { storefrontPromos, type StorefrontPromo } from "@/lib/promotions/channel";

/**
 * The online promos for the ordering website, with their mechanics. Empty when
 * the plan doesn't include promotions, as on the table QR menu.
 */
export async function getStorefrontPromos(
  restaurantId: string,
  categories: { items: { id: string; name: string }[] }[],
): Promise<StorefrontPromo[]> {
  try {
    if (!(await hasFeature(restaurantId, "promotions"))) return [];
    const promos = await getActivePromotions(restaurantId, "online");
    if (promos.length === 0) return [];
    const names = new Map(categories.flatMap((c) => c.items.map((i) => [i.id, i.name] as const)));
    return storefrontPromos(promos, names);
  } catch {
    return [];
  }
}
