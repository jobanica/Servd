import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { getPublicMenu } from "@/server/menu/public-menu";
import { systemDb } from "@/server/tenancy/scoped-db";
import { BrandProvider } from "@/components/diner/BrandProvider";
import { SiteHome } from "@/components/site/SiteHome";

/** Branded host landing — the restaurant's white-label website + online ordering. */
export default async function SiteHomePage({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const [categories, contactRow] = await Promise.all([
    getPublicMenu(restaurant.id),
    systemDb((tx) => tx.restaurant.findFirst({ where: { id: restaurant.id }, select: { printerConfig: true } })).catch(() => null),
  ]);
  const c = (contactRow?.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;

  return (
    <BrandProvider brand={{ brandPrimaryColor: restaurant.brandPrimaryColor, brandAccentColor: restaurant.brandAccentColor }}>
      <SiteHome
        name={restaurant.displayName || restaurant.name}
        logoUrl={restaurant.logoUrl}
        coverImageUrl={restaurant.coverImageUrl}
        tagline={restaurant.tagline}
        categories={categories}
        contact={{ address: c?.address ?? null, phone: c?.phone ?? null }}
        orderHref="/order"
      />
    </BrandProvider>
  );
}
