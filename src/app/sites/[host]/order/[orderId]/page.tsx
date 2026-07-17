import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";
import { systemDb } from "@/server/tenancy/scoped-db";
import { WebOrderTracker } from "@/components/site/WebOrderTracker";

export const metadata = { title: "Track your order" };

/** Permanent, shareable order-status page on a branded host. */
export default async function SiteTrackOrderPage({
  params,
}: {
  params: Promise<{ host: string; orderId: string }>;
}) {
  const { host, orderId } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const order = await systemDb((tx) =>
    tx.order.findFirst({ where: { id: orderId, restaurantId: restaurant.id }, select: { orderType: true } }),
  ).catch(() => null);
  if (!order) notFound();

  return (
    <WebOrderTracker
      slug={restaurant.slug}
      orderId={orderId}
      orderType={order.orderType === "delivery" ? "delivery" : "takeout"}
      restaurantName={restaurant.displayName || restaurant.name}
      homeHref="/"
    />
  );
}
