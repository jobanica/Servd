"use client";

import { useEffect, useState } from "react";
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
import { CallWaiterButton } from "./CallWaiterButton";
import { RewardsPanel } from "./RewardsPanel";
import { OrderStatusTracker } from "./OrderStatusTracker";
import { BrandSplash } from "./BrandSplash";

interface RestaurantBrand {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
}

interface PromoItem {
  id: string;
  title: string;
  description: string | null;
}

/** Product card — image, "+" affordance, price pill, name. */
function ProductCard({
  item,
  soldOutLabel,
  onPick,
}: {
  item: DinerItem;
  soldOutLabel: string;
  onPick: (item: DinerItem) => void;
}) {
  return (
    <button
      type="button"
      disabled={!item.isAvailable}
      onClick={() => onPick(item)}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-brand-ink/5 transition active:scale-[0.98] disabled:opacity-60"
    >
      <div className="relative aspect-square w-full bg-cream">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-gradient text-3xl font-bold text-white">
            {item.name.charAt(0)}
          </div>
        )}

        {/* + add affordance */}
        {item.isAvailable && (
          <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-xl font-bold leading-none text-white shadow-md">
            +
          </span>
        )}

        {/* price pill */}
        <span className="absolute bottom-2 right-2 rounded-full bg-brand-primary px-2.5 py-1 text-xs font-extrabold text-white shadow">
          {formatPeso(item.price)}
        </span>

        {!item.isAvailable && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-brand-ink">
            {soldOutLabel}
          </span>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-sm font-semibold leading-snug text-brand-ink">{item.name}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-brand-ink/50">{item.description}</p>
        )}
      </div>
    </button>
  );
}

function NavButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
        active ? "text-brand-primary" : "text-brand-ink/50"
      }`}
    >
      {children}
      {label}
    </button>
  );
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
  googleReviewUrl = null,
  promotions = [],
  loyaltyEnabled = false,
}: {
  restaurantId: string;
  slug: string;
  tableToken: string;
  tableNumber: string;
  brand: RestaurantBrand;
  categories: DinerCategory[];
  payOnline: boolean;
  justPaid?: boolean;
  googleReviewUrl?: string | null;
  promotions?: PromoItem[];
  loyaltyEnabled?: boolean;
}) {
  const cart = useCart(restaurantId, tableToken);
  const t = useTranslations("diner");

  // Live tracking of the diner's most recent order (survives a refresh).
  const trackKey = `servd:order:${tableToken}`;
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("pending");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(trackKey);
      if (saved) setTrackedOrderId(saved);
    } catch {
      /* ignore */
    }
  }, [trackKey]);

  function startTracking(orderId: string) {
    setTrackedOrderId(orderId);
    try {
      localStorage.setItem(trackKey, orderId);
    } catch {
      /* ignore */
    }
  }
  function stopTracking() {
    setTrackedOrderId(null);
    try {
      localStorage.removeItem(trackKey);
    } catch {
      /* ignore */
    }
  }

  // Loyalty phone/name (remembered so orders earn points automatically).
  const loyaltyKey = `servd:loyaltyPhone:${restaurantId}`;
  const loyaltyNameKey = `servd:loyaltyName:${restaurantId}`;
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [loyaltyName, setLoyaltyName] = useState("");
  useEffect(() => {
    try {
      setLoyaltyPhone(localStorage.getItem(loyaltyKey) ?? "");
      setLoyaltyName(localStorage.getItem(loyaltyNameKey) ?? "");
    } catch {
      /* ignore */
    }
  }, [loyaltyKey, loyaltyNameKey]);
  function saveLoyaltyPhone(p: string, n?: string) {
    setLoyaltyPhone(p);
    try {
      localStorage.setItem(loyaltyKey, p);
      if (n) {
        setLoyaltyName(n);
        localStorage.setItem(loyaltyNameKey, n);
      }
    } catch {
      /* ignore */
    }
  }

  async function submitOrder(): Promise<PlaceOrderResult> {
    return placeOrder({
      slug,
      tableToken,
      loyaltyPhone: loyaltyPhone || undefined,
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [promosOpen, setPromosOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  // Whether the drinks upsell has been resolved for the current cart session.
  const [upsellDone, setUpsellDone] = useState(false);
  // Branded welcome splash shown right after the QR scan, before the menu.
  const [splashDone, setSplashDone] = useState(false);

  const count = cartCount(cart.lines);
  const total = cartTotal(cart.lines);
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  // Drinks / desserts, detected by category name — powers the place-order upsell.
  const DRINK_RE = /drink|beverage|juice|coffee|tea|shake|soda|smoothie|frappe|lemonade|water|cola/i;
  const DESSERT_RE = /dessert|sweet|cake|ice ?cream|pastry|gelato|halo/i;
  const drinkItemIds = new Set(
    categories.filter((c) => DRINK_RE.test(c.name)).flatMap((c) => c.items.map((i) => i.id)),
  );
  const upsellItems = categories
    .filter((c) => DRINK_RE.test(c.name) || DESSERT_RE.test(c.name))
    .flatMap((c) => c.items.filter((i) => i.isAvailable))
    .slice(0, 6);
  const cartHasDrink = cart.lines.some((l) => drinkItemIds.has(l.itemId));
  // Show the upsell before sending the order when there's no drink yet.
  const showUpsellFirst = upsellItems.length > 0 && !cartHasDrink && !upsellDone;

  // Flatten for searching / filtering.
  const flat = nonEmpty.flatMap((c) => c.items.map((it) => ({ it, catId: c.id, catName: c.name })));
  const q = search.trim().toLowerCase();
  const shown = q
    ? flat.filter(({ it }) => it.name.toLowerCase().includes(q))
    : activeCat === "all"
      ? flat
      : flat.filter(({ catId }) => catId === activeCat);

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-brand-surface pb-24">
      {/* "Powered by Servd" welcome splash — shown first, before the menu */}
      {!splashDone && <BrandSplash onDone={() => setSplashDone(true)} />}

      {/* App bar */}
      <header className="sticky top-0 z-20 border-b border-brand-ink/10 bg-brand-surface/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient text-sm font-bold text-white">
              {brand.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-base font-bold text-brand-ink">{brand.name}</h1>
            <p className="truncate text-xs text-brand-ink/55">
              {t("table")} {tableNumber}
            </p>
          </div>
          <LanguageSwitcher />
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="More"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-full border border-brand-ink/10 bg-white px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-ink/40">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-brand-ink/40"
            />
          </div>
        </div>

        {/* Category chips */}
        {nonEmpty.length > 1 && !q && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            <button
              onClick={() => setActiveCat("all")}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                activeCat === "all" ? "bg-brand-primary text-white" : "bg-white text-brand-ink/70 ring-1 ring-brand-ink/10"
              }`}
            >
              {t("all")}
            </button>
            {nonEmpty.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                  activeCat === c.id ? "bg-brand-primary text-white" : "bg-white text-brand-ink/70 ring-1 ring-brand-ink/10"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {justPaid && (
        <div className="mx-4 mt-3 rounded-lg bg-mango/15 px-3 py-2 text-sm text-brand-ink">
          {t("paymentConfirming")}
        </div>
      )}

      {trackedOrderId && (
        <div className="px-4">
          <OrderStatusTracker
            restaurantId={restaurantId}
            slug={slug}
            tableToken={tableToken}
            orderId={trackedOrderId}
            googleReviewUrl={googleReviewUrl}
            onDismiss={stopTracking}
            onStatus={setOrderStatus}
          />
        </div>
      )}

      {/* Product grid */}
      <main className="px-4 pt-4">
        {shown.length === 0 ? (
          <p className="mt-16 text-center text-sm text-brand-ink/50">
            {q ? t("noResults") : t("menuUnavailable")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {shown.map(({ it }) => (
              <ProductCard key={it.id} item={it} soldOutLabel={t("soldOut")} onPick={setActiveItem} />
            ))}
          </div>
        )}
      </main>

      {/* Floating "Request bill" — appears once the food is ready */}
      {trackedOrderId && orderStatus === "done" && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto flex max-w-md flex-col items-center gap-2 px-4">
          <RequestBillButton
            slug={slug}
            tableToken={tableToken}
            prominent
            onRequested={loyaltyEnabled ? () => setRewardsOpen(true) : undefined}
          />
          {loyaltyEnabled && (
            <button
              onClick={() => setRewardsOpen(true)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-primary shadow-lg ring-1 ring-brand-primary/20"
            >
              ⭐ Earn loyalty points
            </button>
          )}
        </div>
      )}

      {/* Bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-end justify-around border-t border-brand-ink/10 bg-white px-2 pb-1 pt-1 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <NavButton label={t("navHome")} onClick={scrollTop}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </NavButton>
        <NavButton label={t("navMenu")} onClick={scrollTop}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </NavButton>

        {/* Center cart */}
        <button onClick={() => setCartOpen(true)} className="relative -mt-6 flex flex-col items-center">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg ring-4 ring-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="18" cy="20" r="1.5" />
              <path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.3h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6" />
            </svg>
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-mango px-1 text-[11px] font-bold text-white ring-2 ring-white">
                {count}
              </span>
            )}
          </span>
        </button>

        <NavButton label={t("navPromos")} onClick={() => setPromosOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7V4h9.6l7.4 7.4a2 2 0 0 1 0 2.8Z" />
            <circle cx="7.5" cy="7.5" r="1.3" />
          </svg>
        </NavButton>
        <NavButton label={t("navMyOrder")} active={!!trackedOrderId} onClick={() => (trackedOrderId ? scrollTop() : setSheetOpen(true))}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" />
            <path d="M9 7h6M9 11h6" />
          </svg>
        </NavButton>
      </nav>

      {/* Cart drawer (rendered before the item modal so the modal stacks on top
          when adding an upsell drink to the same order) */}
      {cartOpen && (
        <CartDrawer
          lines={cart.lines}
          onSetQty={cart.setQty}
          onRemove={cart.removeLine}
          onClose={() => setCartOpen(false)}
          onPlaceOrder={submitOrder}
          onPlaced={(orderId) => {
            cart.clear();
            startTracking(orderId);
            setUpsellDone(false); // reset for the next order
          }}
          upsellItems={upsellItems}
          showUpsellFirst={showUpsellFirst}
          onPickUpsell={(it) => setActiveItem(it)}
          onUpsellResolved={() => setUpsellDone(true)}
        />
      )}

      {/* Item detail / add modal */}
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

      {/* Promotions sheet */}
      {promosOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setPromosOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-ink/15" />
            {loyaltyEnabled && (
              <div className="mb-4">
                <RewardsPanel slug={slug} phone={loyaltyPhone} name={loyaltyName} onPhone={saveLoyaltyPhone} />
              </div>
            )}
            <h2 className="font-heading text-lg font-bold text-brand-ink">🎁 {t("navPromos")}</h2>
            {promotions.length === 0 ? (
              <p className="mt-3 text-sm text-brand-ink/55">{t("noPromos")}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {promotions.map((p) => (
                  <li key={p.id} className="rounded-tile border border-brand-primary/20 bg-brand-primary/5 p-4">
                    <p className="font-heading font-bold text-brand-ink">{p.title}</p>
                    {p.description && (
                      <p className="mt-1 text-sm text-brand-ink/65">{p.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Rewards sheet — prompted after requesting the bill */}
      {rewardsOpen && loyaltyEnabled && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setRewardsOpen(false)}>
          <div className="w-full max-w-md rounded-t-tile bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-ink/15" />
            <RewardsPanel slug={slug} phone={loyaltyPhone} name={loyaltyName} onPhone={saveLoyaltyPhone} />
            <button
              onClick={() => setRewardsOpen(false)}
              className="mt-4 w-full rounded-full border border-brand-ink/15 py-2.5 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* More sheet — pay online, request bill, feedback */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setSheetOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-tile bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-ink/15" />
            <h2 className="font-heading text-lg font-bold text-brand-ink">{t("moreOptions")}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {loyaltyEnabled && (
                <RewardsPanel
                  slug={slug}
                  phone={loyaltyPhone}
                  name={loyaltyName}
                  onPhone={saveLoyaltyPhone}
                />
              )}
              <CallWaiterButton slug={slug} tableToken={tableToken} />
              {payOnline && <PayOnlineButton slug={slug} tableToken={tableToken} />}
              <RequestBillButton slug={slug} tableToken={tableToken} />
              <a
                href={`/order/${slug}/${tableToken}/feedback`}
                className="rounded-full border border-brand-ink/15 py-3 text-center text-sm font-semibold text-brand-ink"
              >
                {t("leaveFeedback")}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
