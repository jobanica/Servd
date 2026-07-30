"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { brandStyle, type BrandInput } from "@/lib/theme/brand";
import { signOut } from "@/app/(platform)/login/actions";
import { PlatformFeedbackButton } from "./PlatformFeedbackButton";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0">
      <path d={d} />
    </svg>
  );
}

const I = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  menu: "M4 6h16M4 12h16M4 18h10",
  layers: "M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  fire: "M12 2c1 3-2 4-2 7a2 2 0 104 0c0-1 0-1 .5-2C16 10 18 12 18 15a6 6 0 11-12 0c0-4 4-6 6-13z",
  cash: "M2 7h20v10H2zM2 11h20M6 15h2",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  star: "M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19l1-5.8L3.6 9.1l5.8-.8z",
  chat: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  bell: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.9",
  brush: "M9 11l6-6 4 4-6 6M9 11l-3 7 7-3M9 11l3 3",
  card: "M2 5h20v14H2zM2 10h20",
  print: "M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-3a2 2 0 012-2h16a2 2 0 012 2v3a2 2 0 01-2 2h-2M6 14h12v7H6z",
  globe: "M12 2a10 10 0 100 20 10 10 0 000-20M2 12h20M12 2c2.5 3 2.5 17 0 20M12 2c-2.5 3-2.5 17 0 20",
  receipt: "M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z M9 8h6M9 12h6",
};

// Nav items that require a plan feature — hidden when the plan lacks it.
const ITEM_FEATURE: Record<string, string> = {
  "/admin/accounting": "accounting",
  "/admin/promotions": "promotions",
  "/admin/happy-hours": "promotions",
  "/admin/gift-cards": "giftCards",
  "/admin/loyalty": "loyalty",
  "/admin/customers": "customers",
  "/admin/sms": "sms",
  "/admin/inventory": "inventory",
  "/admin/hr": "hr",
  "/admin/storefront": "onlineOrdering",
  "/admin/payments": "onlinePayments",
  "/admin/domains": "customDomain",
  "/admin/floor": "floorPlan",
  "/admin/reservations": "reservations",
  "/admin/advance-orders": "onlineOrdering",
  "/merchant": "onlineOrdering",
  "/admin/export": "dataExport",
  "/admin/audit": "auditLog",
};

type Item = { label: string; href: string; d: string };
const NAV: { group: string; items: Item[] }[] = [
  { group: "", items: [{ label: "Dashboard", href: "/admin", d: I.home }] },
  {
    group: "Menu",
    items: [
      { label: "Menu", href: "/admin/menu", d: I.menu },
      { label: "Modifiers", href: "/admin/modifiers", d: I.layers },
      { label: "Tables & QR", href: "/admin/tables", d: I.grid },
      { label: "Floor plan", href: "/admin/floor", d: I.grid },
      { label: "Reservations", href: "/admin/reservations", d: I.grid },
      { label: "Advance orders", href: "/admin/advance-orders", d: I.receipt },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "Kitchen", href: "/kitchen", d: I.fire },
      { label: "Cashier", href: "/cashier", d: I.cash },
      { label: "Merchant app", href: "/merchant", d: I.bell },
      { label: "My time clock", href: "/clock/me", d: I.receipt },
    ],
  },
  {
    group: "Grow",
    items: [
      { label: "Analytics", href: "/admin/analytics", d: I.chart },
      { label: "Accounting", href: "/admin/accounting", d: I.receipt },
      { label: "Feedback", href: "/admin/feedback", d: I.star },
      { label: "Promotions", href: "/admin/promotions", d: I.star },
      { label: "Happy hour", href: "/admin/happy-hours", d: I.star },
      { label: "Gift cards", href: "/admin/gift-cards", d: I.star },
      { label: "Loyalty & rewards", href: "/admin/loyalty", d: I.star },
      { label: "Refer & earn", href: "/admin/referrals", d: I.star },
      { label: "Customers", href: "/admin/customers", d: I.users },
      { label: "SMS marketing", href: "/admin/sms", d: I.chat },
    ],
  },
  {
    group: "Back office",
    items: [
      { label: "Inventory", href: "/admin/inventory", d: I.box },
      { label: "HR", href: "/admin/hr", d: I.users },
    ],
  },
  {
    group: "Settings",
    items: [
      { label: "Account", href: "/admin/account", d: I.users },
      { label: "Staff & access", href: "/admin/staff", d: I.users },
      { label: "Cashier", href: "/admin/cashier", d: I.cash },
      { label: "Online website", href: "/admin/storefront", d: I.globe },
      { label: "Branding", href: "/admin/branding", d: I.brush },
      { label: "Online payment", href: "/admin/payments", d: I.card },
      { label: "Delivery partners", href: "/admin/delivery", d: I.box },
      { label: "Printing", href: "/admin/printing", d: I.print },
      { label: "Custom domain", href: "/admin/domains", d: I.globe },
      { label: "Billing", href: "/admin/billing", d: I.receipt },
      { label: "Data export", href: "/admin/export", d: I.receipt },
      { label: "Audit log", href: "/admin/audit", d: I.receipt },
    ],
  },
];

export function AdminShell({
  brand,
  theme,
  fullWhiteLabel = false,
  features,
  children,
}: {
  brand: { name: string; slug: string; status: string; logoUrl?: string | null };
  theme?: BrandInput;
  fullWhiteLabel?: boolean;
  features?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // Show ALL items; "locked" ones (not in the plan) route to the upgrade page.
  const allowed = features ? new Set(features) : null;
  const isLocked = (href: string) => {
    const f = ITEM_FEATURE[href];
    return !!f && !!allowed && !allowed.has(f);
  };

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((section, i) => (
        <div key={i}>
          {section.group && (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-plum-ink/35">
              {section.group}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const locked = isLocked(item.href);
              const href = locked
                ? `/admin/billing?upgrade=${ITEM_FEATURE[item.href]}`
                : item.href;
              const active = !locked && isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={href}
                  onClick={() => setOpen(false)}
                  title={locked ? "Upgrade to unlock" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-brand-gradient text-white shadow-sm"
                      : locked
                        ? "text-plum-ink/40 hover:bg-plum-ink/5"
                        : "text-plum-ink/70 hover:bg-plum-ink/5 hover:text-plum-ink"
                  }`}
                >
                  <Icon d={item.d} />
                  <span className="flex-1">{item.label}</span>
                  {locked && (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-mango">
                      {/* lock icon */}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3">
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                      </svg>
                      Upgrade
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* The restaurant's own brand — their logo (or a monogram) + name. */}
      <Link href="/admin" className="flex w-full items-center gap-2.5 overflow-hidden px-5 py-4">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logoUrl} alt={brand.name} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-sm font-bold text-white">
            {brand.name.charAt(0).toUpperCase()}
          </span>
        )}
        {/* Wrap a long business name to 2 lines instead of overflowing the sidebar. */}
        <span className="line-clamp-2 min-w-0 flex-1 break-words font-heading text-base font-bold leading-tight text-plum-ink">
          {brand.name}
        </span>
      </Link>
      {nav}
      <div className="space-y-1 border-t border-plum-ink/10 p-3">
        <PlatformFeedbackButton />
        <form action={signOut}>
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-plum-ink/60 hover:bg-plum-ink/5">
            Sign out
          </button>
        </form>
        {!fullWhiteLabel && (
          <p className="flex items-center gap-1 px-3 pt-1 text-[11px] text-plum-ink/35">
            Powered by <Wordmark size="0.72rem" />
          </p>
        )}
      </div>
    </div>
  );

  return (
    // Tint the dashboard accents (buttons, active nav, gradient) with the
    // restaurant's brand color via the --brand-* CSS variables.
    <div className="flex min-h-screen bg-cream" style={brandStyle(theme ?? {})}>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-plum-ink/10 bg-white md:flex print:hidden">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* No global trial banner — the trial countdown lives on the Billing page,
            and locked features show a contextual "included in [plan]" upgrade
            prompt instead of a persistent nag. */}

        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-plum-ink/10 bg-white/80 px-4 py-3 backdrop-blur print:hidden">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-1.5 text-plum-ink/70 hover:bg-plum-ink/5 md:hidden"
            aria-label="Open menu"
          >
            <Icon d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold text-plum-ink">{brand.name}</p>
            <p className="truncate text-xs text-plum-ink/45">/{brand.slug}</p>
          </div>
          <span
            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              brand.status === "active"
                ? "bg-mango/15 text-mango"
                : brand.status === "suspended"
                  ? "bg-guava/15 text-guava"
                  : "bg-plum-ink/10 text-plum-ink/60"
            }`}
          >
            {brand.status}
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
