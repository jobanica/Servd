import { notFound } from "next/navigation";
import {
  getPublicRestaurantBySlug,
  getTableByToken,
} from "@/server/restaurants/get-public";
import { FeedbackForm } from "@/components/diner/FeedbackForm";

/**
 * Diner feedback screen (white-label). Reached after payment, or via the "Leave
 * feedback" link. Everyone gets the same rating + comment ask and the same
 * Google review invite — no sentiment-based routing.
 */
export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ slug: string; tableToken: string }>;
}) {
  const { slug, tableToken } = await params;
  const restaurant = await getPublicRestaurantBySlug(slug);
  if (!restaurant) notFound();
  const table = await getTableByToken(restaurant.id, tableToken);
  if (!table) notFound();

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <div className="rounded-tile bg-white p-6 shadow-sm">
        <FeedbackForm
          slug={slug}
          tableToken={tableToken}
          googleReviewUrl={restaurant.googleReviewUrl}
        />
      </div>
    </div>
  );
}
