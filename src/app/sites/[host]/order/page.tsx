import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getPublicMenu } from "@/server/menu/public-menu";
import { BrandProvider } from "@/components/diner/BrandProvider";
import { WebOrder } from "@/components/site/WebOrder";

/** Online ordering on a branded host (pickup / delivery, no table). */
export default async function SiteOrderPage({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();
  const categories = await getPublicMenu(restaurant.id);

  return (
    <BrandProvider brand={{ brandPrimaryColor: restaurant.brandPrimaryColor, brandAccentColor: restaurant.brandAccentColor }}>
      <WebOrder slug={restaurant.slug} restaurantName={restaurant.displayName || restaurant.name} categories={categories} homeHref="/" />
    </BrandProvider>
  );
}
