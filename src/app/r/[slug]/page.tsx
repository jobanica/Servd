import { notFound } from "next/navigation";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { systemDb } from "@/server/tenancy/scoped-db";
import { BrandProvider } from "@/components/diner/BrandProvider";
import { SiteHome } from "@/components/site/SiteHome";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getPublicRestaurantBySlug(slug);
  const name = r ? r.displayName || r.name : "Restaurant";
  return { title: `${name} — Order online`, description: r?.tagline ?? `Order from ${name}.` };
}

async function getContact(restaurantId: string) {
  try {
    const r = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id: restaurantId }, select: { printerConfig: true } }),
    );
    const c = (r?.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;
    return { address: c?.address ?? null, phone: c?.phone ?? null };
  } catch {
    return { address: null, phone: null };
  }
}

export default async function RestaurantSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const [categories, contact] = await Promise.all([
    getPublicMenu(restaurant.id),
    getContact(restaurant.id),
  ]);

  return (
    <BrandProvider brand={{ brandPrimaryColor: restaurant.brandPrimaryColor, brandAccentColor: restaurant.brandAccentColor }}>
      <SiteHome
        name={restaurant.displayName || restaurant.name}
        logoUrl={restaurant.logoUrl}
        coverImageUrl={restaurant.coverImageUrl}
        tagline={restaurant.tagline}
        categories={categories}
        contact={contact}
        orderHref={`/r/${slug}/order`}
      />
    </BrandProvider>
  );
}
