"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatPeso } from "@/lib/money";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cartCount, cartTotal } from "@/lib/cart/pricing";
import { useCart } from "@/lib/cart/useCart";
import type { DinerCategory, DinerItem } from "@/lib/cart/types";
import { placeOrder } from "@/server/orders/place-order";
import type { PlaceOrderResult } from "@/lib/validation/order";
import { ItemModal } from "./ItemModal";
import { CartDrawer } from "./CartDrawer";
import { RequestBillButton } from "./RequestBillButton";
import { PayOnlineButton } from "./PayOnlineButton";

interface RestaurantBrand {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
}

export function DinerMenu({
  restaurantId,
  slug,
  tableToken,
  tableNumber,
  brand,
  categories,
  payOnline,
  justPaid,
}: {
  restaurantId: string;
  slug: string;
  tableToken: string;
  tableNumber: string;
  brand: RestaurantBrand;
  categories: DinerCategory[];
  payOnline: boolean;
  justPaid?: boolean;
}) {
  const cart = useCart(restaurantId, tableToken);
  const t = useTranslations("diner");

  // Build the untrusted payload (ids + quantities only) and submit it. The
  // server re-validates and recomputes the real total.
  async function submitOrder(): Promise<PlaceOrderResult> {
    return placeOrder({
      slug,
      tableToken,
      lines: cart.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        note: l.note,
        modifierIds: l.modifiers.map((m) => m.modifierId),
      })),
    });
  }
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
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-bold text-brand-ink">
            {brand.name}
          </h1>
          <p className="text-sm text-brand-ink/60">
            {brand.tagline
              ? `${brand.tagline} · ${t("table")} ${tableNumber}`
              : `${t("table")} ${tableNumber}`}
          </p>
        </div>
        <LanguageSwitcher />
      </header>

      {justPaid && (
        <div className="mt-3 rounded-lg bg-mango/15 px-3 py-2 text-sm text-brand-ink">
          {t("paymentConfirming")}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <a
          href={`/order/${slug}/${tableToken}/feedback`}
          className="text-sm font-semibold text-brand-primary"
        >
          {t("leaveFeedback")}
        </a>
        {payOnline && <PayOnlineButton slug={slug} tableToken={tableToken} />}
        <RequestBillButton slug={slug} tableToken={tableToken} />
      </div>

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
          {t("menuUnavailable")}
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
                          {t("soldOut")}
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
            <span>{t("items", { count })}</span>
            <span>{t("viewOrder")} · {formatPeso(total)}</span>
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
          onPlaceOrder={submitOrder}
          onPlaced={cart.clear}
        />
      )}
    </div>
  );
}
