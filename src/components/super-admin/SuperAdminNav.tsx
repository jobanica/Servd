"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Overview", href: "/super-admin" },
  { label: "Subscriptions", href: "/super-admin/subscriptions" },
  { label: "Plans", href: "/super-admin/plans" },
  { label: "Invoices", href: "/super-admin/invoices" },
];

export function SuperAdminNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/super-admin" ? pathname === "/super-admin" : pathname.startsWith(href);

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              active
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-plum-ink/55 hover:text-plum-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
