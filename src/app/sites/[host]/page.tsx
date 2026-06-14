import { notFound } from "next/navigation";
import { getRestaurantByHost } from "@/server/restaurants/get-by-host";

/** Branded host landing — diners arrive here by typing the domain (no table). */
export default async function SiteHome({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;
  const restaurant = await getRestaurantByHost(decodeURIComponent(host));
  if (!restaurant) notFound();

  const name = restaurant.displayName || restaurant.name;
  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center">
      {restaurant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={restaurant.logoUrl}
          alt={name}
          className="mx-auto h-20 w-20 rounded-2xl object-cover"
        />
      ) : (
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-gradient text-3xl font-bold text-white">
          {name.charAt(0)}
        </div>
      )}
      <h1 className="mt-4 font-heading text-2xl font-bold text-brand-ink">{name}</h1>
      {restaurant.tagline && (
        <p className="mt-1 text-brand-ink/60">{restaurant.tagline}</p>
      )}
      <p className="mt-8 text-sm text-brand-ink/60">
        Scan the QR code on your table to view the menu and order.
      </p>
    </div>
  );
}
