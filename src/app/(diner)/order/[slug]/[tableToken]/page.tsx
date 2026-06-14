import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
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
  searchParams,
}: {
  params: Promise<{ slug: string; tableToken: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { slug, tableToken } = await params;
  const { paid } = await searchParams;

  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const table = await getTableByToken(restaurant.id, tableToken);
  if (!table) notFound();

  const locale = await getLocale();
  const categories = await getPublicMenu(restaurant.id, locale);

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
      payOnline={restaurant.paymentOnlineEnabled}
      justPaid={paid === "1"}
    />
  );
}
