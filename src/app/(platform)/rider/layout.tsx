import type { Metadata, Viewport } from "next";

// Its own manifest, so "Add to Home Screen" opens straight into /rider.
export const metadata: Metadata = {
  title: "Rider — Servd",
  manifest: "/rider.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Rider" },
  icons: {
    icon: [{ url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/brand/icon-apple-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#DC2626",
  width: "device-width",
  initialScale: 1,
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
