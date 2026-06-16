import { notFound } from "next/navigation";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { BrandProvider } from "@/components/diner/BrandProvider";
import { WebOrder } from "@/components/site/WebOrder";

export default async function WebOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();
  const categories = await getPublicMenu(restaurant.id);

  return (
    <BrandProvider
      brand={{ brandPrimaryColor: restaurant.brandPrimaryColor, brandAccentColor: restaurant.brandAccentColor }}
    >
      <WebOrder slug={slug} restaurantName={restaurant.displayName || restaurant.name} categories={categories} />
    </BrandProvider>
  );
}
