import { notFound } from "next/navigation";
import {
  getPublicRestaurantBySlug,
  getTableByToken,
} from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { DinerMenu } from "@/components/diner/DinerMenu";

/**
 * Diner entry point from the QR scan: /order/{slug}/{tableToken}
 *
 * No login — the table is identified by the token in the URL. The page renders
 * fully white-label (the parent layout applied the restaurant's brand colors).
 */
export default async function DinerOrderPage({
  params,
}: {
  params: Promise<{ slug: string; tableToken: string }>;
}) {
  const { slug, tableToken } = await params;

  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const table = await getTableByToken(restaurant.id, tableToken);
  if (!table) notFound();

  const categories = await getPublicMenu(restaurant.id);

  return (
    <DinerMenu
      restaurantId={restaurant.id}
      slug={slug}
      tableToken={tableToken}
      tableNumber={table.tableNumber}
      brand={{
        name: restaurant.displayName || restaurant.name,
        logoUrl: restaurant.logoUrl,
        tagline: restaurant.tagline,
      }}
      categories={categories}
    />
  );
}
