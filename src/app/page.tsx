import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";

// Platform marketing page — full Servd identity.
export default function Home() {
  return (
    <main className="min-h-screen bg-cream text-plum-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <AppIcon size={36} />
          <Wordmark size="1.5rem" />
        </div>
        <Link
          href="/login"
          className="rounded-full px-5 py-2 text-sm font-semibold btn-brand"
        >
          Staff login
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 text-center">
        <h1 className="font-heading text-5xl font-extrabold leading-tight tracking-tight">
          Scan. Order. Pay.
        </h1>
        <p className="mt-5 text-lg text-plum-ink/70">
          A QR-based ordering platform for restaurants — real-time kitchen
          tickets, online payment, and your own branding on every diner screen.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-full px-6 py-3 font-semibold btn-brand"
          >
            Start your restaurant
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-plum-ink/15 px-6 py-3 font-semibold"
          >
            Staff login
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-20 grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-3">
        {[
          ["Real-time kitchen", "Orders appear instantly, tagged to the table."],
          ["Online payment", "GCash & cards — funds go straight to you."],
          ["Your brand", "Every diner page wears your logo and colors."],
        ].map(([title, body]) => (
          <div
            key={title}
            className="rounded-tile border border-plum-ink/10 bg-white p-6"
          >
            <h3 className="font-heading text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm text-plum-ink/70">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
