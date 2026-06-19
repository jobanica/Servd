"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { signOut } from "@/app/(platform)/login/actions";

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const I = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  card: "M2 5h20v14H2zM2 10h20",
  layers: "M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5",
  receipt: "M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z M9 8h6M9 12h6",
  userPlus: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M19 8v6M22 11h-6",
  chat: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  back: "M19 12H5M12 19l-7-7 7-7",
};

const NAV = [
  { label: "Overview", href: "/super-admin", d: I.home },
  { label: "Subscriptions", href: "/super-admin/subscriptions", d: I.card },
  { label: "Create account", href: "/super-admin/accounts", d: I.userPlus },
  { label: "Plans", href: "/super-admin/plans", d: I.layers },
  { label: "Invoices", href: "/super-admin/invoices", d: I.receipt },
  { label: "Payments", href: "/super-admin/payments", d: I.card },
  { label: "Referrals", href: "/super-admin/referrals", d: I.receipt },
  { label: "Partners", href: "/super-admin/partners", d: I.card },
  { label: "Feedback", href: "/super-admin/feedback", d: I.chat },
];

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/super-admin" ? pathname === "/super-admin" : pathname.startsWith(href);

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-plum-ink/35">
        Platform
      </p>
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-brand-gradient text-white shadow-sm"
                : "text-plum-ink/70 hover:bg-plum-ink/5 hover:text-plum-ink"
            }`}
          >
            <Icon d={item.d} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/super-admin" className="flex items-center gap-2 px-5 py-4">
        <AppIcon size={28} />
        <Wordmark size="1.15rem" />
      </Link>
      {nav}
      <div className="space-y-1 border-t border-plum-ink/10 p-3">
        <form action={signOut}>
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-plum-ink/60 hover:bg-plum-ink/5">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-cream">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-plum-ink/10 bg-white md:flex">
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
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-plum-ink/10 bg-white/80 px-4 py-3 backdrop-blur">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-1.5 text-plum-ink/70 hover:bg-plum-ink/5 md:hidden"
            aria-label="Open menu"
          >
            <Icon d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-heading text-sm font-bold text-plum-ink">Servd · platform admin</p>
            <p className="truncate text-xs text-plum-ink/45">Manage every restaurant&apos;s subscription</p>
          </div>
          <span className="ml-auto rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-semibold text-brand-primary">
            super-admin
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
