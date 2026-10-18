import type { Metadata, Viewport } from "next";

// An installable app of its own, "Riders", with the Servd mark on purple so a
// rider tells it apart from the shop's orange Servd apps on the home screen.
// Its own manifest, so "Add to Home Screen" opens straight into /rider.
export const metadata: Metadata = {
  title: "Riders — Servd",
  applicationName: "Riders",
  manifest: "/rider.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Riders" },
  icons: {
    icon: [{ url: "/brand/rider/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/brand/rider/icon-apple-180.png", sizes: "180x180", type: "image/png" }],
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
