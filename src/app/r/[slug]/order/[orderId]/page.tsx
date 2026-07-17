import { notFound } from "next/navigation";
import { getPublicRestaurantBySlug } from "@/server/restaurants/get-public";
import { systemDb } from "@/server/tenancy/scoped-db";
import { WebOrderTracker } from "@/components/site/WebOrderTracker";

export const metadata = { title: "Track your order" };

/**
 * Permanent, shareable order-status page. The order id is an unguessable UUID,
 * so the link is safe to bookmark. Lets a customer re-open their order status
 * after closing the tab.
 */
export default async function TrackOrderPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();

  // Validate the order belongs to this restaurant and get its type (for the
  // pickup vs delivery step labels).
  const order = await systemDb((tx) =>
    tx.order.findFirst({ where: { id: orderId, restaurantId: restaurant.id }, select: { orderType: true } }),
  ).catch(() => null);
  if (!order) notFound();

  return (
    <WebOrderTracker
      slug={slug}
      orderId={orderId}
      orderType={order.orderType === "delivery" ? "delivery" : "takeout"}
      restaurantName={restaurant.displayName || restaurant.name}
      homeHref={`/r/${slug}`}
    />
  );
}
