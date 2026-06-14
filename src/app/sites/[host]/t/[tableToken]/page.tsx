import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getTableByToken } from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { DinerMenu } from "@/components/diner/DinerMenu";

/**
 * Branded-host table entry: e.g. mango-grill.servd.app/t/<token>.
 * Resolves the restaurant by host, then reuses the exact same DinerMenu — the
 * order/pay/bill actions resolve by slug, so they work identically on any host.
 */
export default async function SiteTablePage({
  params,
}: {
  params: Promise<{ host: string; tableToken: string }>;
}) {
  const { host, tableToken } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const table = await getTableByToken(restaurant.id, tableToken);
  if (!table) notFound();

  const locale = await getLocale();
  const categories = await getPublicMenu(restaurant.id, locale);

  return (
    <DinerMenu
      restaurantId={restaurant.id}
      slug={restaurant.slug}
      tableToken={tableToken}
      tableNumber={table.tableNumber}
      brand={{
        name: restaurant.displayName || restaurant.name,
        logoUrl: restaurant.logoUrl,
        tagline: restaurant.tagline,
      }}
      categories={categories}
      payOnline={restaurant.paymentOnlineEnabled}
    />
  );
}
