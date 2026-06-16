import Link from "next/link";
import type { DinerCategory } from "@/lib/cart/types";
import { formatPeso } from "@/lib/money";

export interface SiteHomeData {
  name: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  tagline: string | null;
  categories: DinerCategory[];
  contact: { address: string | null; phone: string | null };
  orderHref: string;
}

/** White-label restaurant homepage (used on the platform URL and custom domains). */
export function SiteHome({ name, logoUrl, coverImageUrl, tagline, categories, contact, orderHref }: SiteHomeData) {
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  return (
    <>
      <header className="relative">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImageUrl} alt="" className="h-56 w-full object-cover sm:h-72" />
        ) : (
          <div className="h-44 w-full bg-brand-gradient sm:h-56" />
        )}
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-5 pb-6">
          <div className="flex items-end gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={name} className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-lg" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-brand-gradient text-3xl font-bold text-white shadow-lg">{name.charAt(0)}</div>
            )}
            <div className="pb-1 text-white drop-shadow">
              <h1 className="font-heading text-2xl font-extrabold sm:text-3xl">{name}</h1>
              {tagline && <p className="text-sm text-white/90">{tagline}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-6">
        <div className="rounded-tile border border-brand-ink/10 bg-white p-5 text-center shadow-sm">
          <p className="font-heading text-lg font-bold text-brand-ink">Order online for pickup or delivery</p>
          <p className="mt-1 text-sm text-brand-ink/60">Browse the menu and check out in a minute.</p>
          <Link href={orderHref} className="mt-4 inline-block rounded-full px-8 py-3 font-semibold text-white shadow-lg btn-brand">🛒 Order now</Link>
        </div>

        {(contact.address || contact.phone) && (
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-brand-ink/70">
            {contact.address && <span>📍 {contact.address}</span>}
            {contact.phone && <span>📞 {contact.phone}</span>}
          </div>
        )}

        <h2 className="mt-8 font-heading text-xl font-bold text-brand-ink">Menu</h2>
        {nonEmpty.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/50">The menu is being prepared. Check back soon.</p>
        ) : (
          nonEmpty.map((cat) => (
            <section key={cat.id} className="mt-5">
              <h3 className="font-heading text-base font-bold text-brand-ink">{cat.name}</h3>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cat.items.slice(0, 6).map((it) => (
                  <div key={it.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-brand-ink/5">
                    <div className="relative aspect-square bg-cream">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-brand-gradient text-2xl font-bold text-white">{it.name.charAt(0)}</div>
                      )}
                      <span className="absolute bottom-2 right-2 rounded-full bg-brand-primary px-2.5 py-1 text-xs font-extrabold text-white">{formatPeso(it.price)}</span>
                    </div>
                    <p className="p-2.5 text-sm font-semibold text-brand-ink">{it.name}</p>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-3xl p-4">
        <Link href={orderHref} className="block rounded-full px-5 py-3.5 text-center font-semibold text-white shadow-lg btn-brand">🛒 Order online</Link>
      </div>
    </>
  );
}
