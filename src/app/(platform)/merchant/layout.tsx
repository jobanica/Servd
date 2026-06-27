import type { Metadata, Viewport } from "next";

// A focused, installable kiosk view — its own manifest so "Add to home screen"
// launches straight into /merchant in standalone (full-screen) mode.
export const metadata: Metadata = {
  title: "Incoming Orders — Servd",
  manifest: "/merchant.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Orders" },
};

export const viewport: Viewport = {
  themeColor: "#FF7A1A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
