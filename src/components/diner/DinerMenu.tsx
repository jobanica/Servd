"use client";

import { useState } from "react";
import { formatPeso } from "@/lib/money";
import { cartCount, cartTotal } from "@/lib/cart/pricing";
import { useCart } from "@/lib/cart/useCart";
import type { DinerCategory, DinerItem } from "@/lib/cart/types";
import { ItemModal } from "./ItemModal";
import { CartDrawer } from "./CartDrawer";

interface RestaurantBrand {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
}

export function DinerMenu({
  restaurantId,
  tableToken,
  tableNumber,
  brand,
  categories,
}: {
  restaurantId: string;
  tableToken: string;
  tableNumber: string;
  brand: RestaurantBrand;
  categories: DinerCategory[];
}) {
  const cart = useCart(restaurantId, tableToken);
  const [activeItem, setActiveItem] = useState<DinerItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const count = cartCount(cart.lines);
  const total = cartTotal(cart.lines);
  const nonEmptyCategories = categories.filter((c) => c.items.length > 0);

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-5">
      {/* Brand header — the restaurant's identity, not Servd's */}
      <header className="flex items-center gap-3">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="h-12 w-12 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white">
            {brand.name.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="font-heading text-xl font-bold text-brand-ink">
            {brand.name}
          </h1>
          <p className="text-sm text-brand-ink/60">
            {brand.tagline ?? `Table ${tableNumber}`}
          </p>
        </div>
      </header>

      {/* Sticky category nav */}
      {nonEmptyCategories.length > 1 && (
        <nav className="sticky top-0 z-10 -mx-4 mt-4 flex gap-2 overflow-x-auto bg-brand-surface/90 px-4 py-2 backdrop-blur">
          {nonEmptyCategories.map((c) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className="whitespace-nowrap rounded-full border border-brand-ink/15 px-3 py-1 text-sm"
            >
              {c.name}
            </a>
          ))}
        </nav>
      )}

      {nonEmptyCategories.length === 0 && (
        <p className="mt-10 text-center text-sm text-brand-ink/50">
          This menu isn’t available yet. Please check back soon.
        </p>
      )}

      {nonEmptyCategories.map((category) => (
        <section key={category.id} id={`cat-${category.id}`} className="mt-6 scroll-mt-16">
          <h2 className="font-heading text-lg font-bold text-brand-ink">
            {category.name}
          </h2>
          <ul className="mt-2 space-y-2">
            {category.items.map((item) => (
              <li key={item.id}>
                <button
                  disabled={!item.isAvailable}
                  onClick={() => setActiveItem(item)}
                  className="flex w-full items-center gap-3 rounded-tile border border-brand-ink/10 bg-white p-3 text-left disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-brand-ink">
                        {item.name}
                      </span>
                      {!item.isAvailable && (
                        <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs text-muted">
                          Sold out
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="truncate text-sm text-brand-ink/50">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1 font-semibold text-brand-ink">
                      {formatPeso(item.price)}
                    </p>
                  </div>
                  {item.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Sticky cart bar */}
      {cart.hydrated && count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md p-4">
          <button
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between rounded-full px-5 py-3 font-semibold text-white shadow-lg btn-brand"
          >
            <span>
              {count} item{count > 1 ? "s" : ""}
            </span>
            <span>View order · {formatPeso(total)}</span>
          </button>
        </div>
      )}

      {activeItem && (
        <ItemModal
          item={activeItem}
          onAdd={(line) => {
            cart.addLine(line);
            setActiveItem(null);
          }}
          onClose={() => setActiveItem(null)}
        />
      )}

      {cartOpen && (
        <CartDrawer
          lines={cart.lines}
          onSetQty={cart.setQty}
          onRemove={cart.removeLine}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
