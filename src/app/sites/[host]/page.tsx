import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getPublicMenu } from "@/server/menu/public-menu";
import { getLoyaltyConfig } from "@/server/loyalty/loyalty";
import { getPublicStorefront, isOpenNow } from "@/server/storefront/storefront";
import { systemDb } from "@/server/tenancy/scoped-db";
import { WebOrder } from "@/components/site/WebOrder";

/** Branded host — the restaurant's white-label website + online ordering. */
export default async function SiteHomePage({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const [categories, loyalty, sf, contactRow] = await Promise.all([
    getPublicMenu(restaurant.id),
    getLoyaltyConfig(restaurant.id),
    getPublicStorefront(restaurant.id),
    systemDb((tx) => tx.restaurant.findFirst({ where: { id: restaurant.id }, select: { printerConfig: true } })).catch(() => null),
  ]);
  const c = (contactRow?.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;

  return (
    <WebOrder
      slug={restaurant.slug}
      restaurantName={restaurant.displayName || restaurant.name}
      logoUrl={restaurant.logoUrl}
      categories={categories}
      contact={{ address: c?.address ?? null, phone: c?.phone ?? null }}
      payOnline={restaurant.paymentOnlineEnabled}
      loyalty={loyalty}
      hours={sf.hours}
      zones={sf.zones}
      openNow={isOpenNow(sf.hours)}
      homeHref="/"
    />
  );
}
