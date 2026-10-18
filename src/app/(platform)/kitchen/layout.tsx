import type { Metadata } from "next";

// The kitchen display installs as its own app, scoped to /kitchen, so it never
// overlaps the cashier, merchant or rider apps (see lib/pwa/app-login).
export const metadata: Metadata = {
  title: "Kitchen — Servd",
  manifest: "/kitchen.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kitchen" },
};

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
