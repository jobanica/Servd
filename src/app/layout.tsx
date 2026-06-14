import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import "@/styles/globals.css";

// Outfit = wordmark + headings (700–800). Inter = UI/body. Loaded once here and
// exposed as CSS variables the design tokens reference.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Servd — QR ordering for restaurants",
  description:
    "Scan, order, pay. A QR-based ordering platform for restaurants.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
