import type { Metadata, Viewport } from "next";

// A focused, installable kiosk view — its own manifest so "Add to home screen"
// launches straight into /merchant in standalone (full-screen) mode. Installed
// as "Merchant", with the Servd mark on red, apart from the other Servd apps.
export const metadata: Metadata = {
  title: "Merchant — Servd",
  applicationName: "Merchant",
  manifest: "/merchant.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Merchant" },
  icons: {
    icon: [{ url: "/brand/merchant/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/brand/merchant/icon-apple-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#DC2626",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
