import type { Metadata } from "next";
import { Outfit, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${outfit.variable} ${inter.variable}`}>
      <body>
        {/* Messages are provided to client components; server components use
            getTranslations directly. */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
