import { notFound } from "next/navigation";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";
import { getPublicMenu } from "@/server/menu/public-menu";
import { getLoyaltyConfig } from "@/server/loyalty/loyalty";
import { systemDb } from "@/server/tenancy/scoped-db";
import { WebOrder } from "@/components/site/WebOrder";

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

  const [categories, loyalty, contact] = await Promise.all([
    getPublicMenu(restaurant.id),
    getLoyaltyConfig(restaurant.id),
    getContact(restaurant.id),
  ]);

  return (
    <WebOrder
      slug={slug}
      restaurantName={restaurant.displayName || restaurant.name}
      logoUrl={restaurant.logoUrl}
      categories={categories}
      contact={contact}
      payOnline={restaurant.paymentOnlineEnabled}
      loyalty={loyalty}
      homeHref={`/r/${slug}`}
    />
  );
}
