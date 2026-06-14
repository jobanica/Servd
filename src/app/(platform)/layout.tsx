import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";

/**
 * Platform chrome — the Servd identity wraps everything in this route group
 * (login, signup, admin, kitchen, cashier, super-admin). Diner pages live in a
 * different route group and do NOT use this shell.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream text-plum-ink">
      <header className="border-b border-plum-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <AppIcon size={28} />
            <Wordmark size="1.15rem" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
