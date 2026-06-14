import { notFound } from "next/navigation";
import {
  getPublicRestaurantBySlug,
  getTableByToken,
} from "@/server/restaurants/get-public";

/**
 * Diner entry point from the QR scan: /order/{slug}/{tableToken}
 *
 * The table is identified by the token embedded in the QR code — no login. This
 * page proves the white-label skin is live (it renders in the restaurant's
 * colors, set by the parent layout). The actual menu/cart arrive in Phase 4.
 */
export default async function DinerOrderPage({
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
      {/* Brand header — restaurant's own logo/name, NOT Servd's */}
      <div className="flex items-center gap-3">
        {restaurant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={restaurant.logoUrl}
            alt={restaurant.displayName || restaurant.name}
            className="h-12 w-12 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white">
            {(restaurant.displayName || restaurant.name).charAt(0)}
          </div>
        )}
        <div>
          <h1 className="font-heading text-xl font-bold text-brand-ink">
            {restaurant.displayName || restaurant.name}
          </h1>
          {restaurant.tagline && (
            <p className="text-sm text-brand-ink/60">{restaurant.tagline}</p>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-tile bg-white p-5 shadow-sm">
        <p className="text-sm text-brand-ink/60">You&apos;re seated at</p>
        <p className="font-heading text-3xl font-extrabold text-brand-primary">
          Table {table.tableNumber}
        </p>
      </div>

      <button className="mt-6 w-full rounded-full py-3 font-semibold btn-brand">
        View menu
      </button>
      <p className="mt-3 text-center text-xs text-brand-ink/40">
        Menu &amp; ordering arrive in Phase 4.
      </p>
    </div>
  );
}
