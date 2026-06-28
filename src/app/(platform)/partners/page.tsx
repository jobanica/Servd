import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { EarningsCalculator } from "@/components/partner/EarningsCalculator";
import { getPartnerProgram } from "@/server/partners/program";
import { formatPHP } from "@/lib/partners/program";

const APPLY = "/partner/apply";

export const metadata: Metadata = {
  title: "Servd Partner Program — earn recurring income referring restaurants",
  description:
    "Refer restaurants to Servd and earn 30% commission in year one, then 10% for the life of every subscription — plus stacking milestone bonuses. Free to join, no earnings cap.",
  openGraph: {
    title: "Become a Servd Partner",
    description:
      "30% first year, then 10% for life on every restaurant you refer. Free to join, paid monthly.",
    type: "website",
    images: [{ url: "/brand/servd-icon.svg" }],
  },
};

/* scan-corner bracket (QR-style) used as a faint hero motif */
function ScanCorner({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <path d="M2 14V2h12" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient font-heading text-sm font-bold text-white">
        {n}
      </div>
      <h3 className="mt-3 font-heading text-lg font-bold">{title}</h3>
      <p className="mt-1 text-sm text-plum-ink/60">{body}</p>
    </div>
  );
}

export default async function PartnersPage() {
  const program = await getPartnerProgram();

  return (
    <div className="bg-cream text-plum-ink">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-plum-ink/5 bg-cream/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <AppIcon size={32} />
            <Wordmark size="1.4rem" />
          </Link>
          <Link href={APPLY} className="btn-brand rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm">
            Become a partner
          </Link>
        </div>
      </header>

      {/* 1. Hero */}
      <section className="relative overflow-hidden bg-plum-ink text-cream">
        {/* brand bloom */}
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "linear-gradient(135deg,#FF9A2E,#FF7A1A,#FF4D6D)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full opacity-20 blur-3xl"
          style={{ background: "linear-gradient(135deg,#FF7A1A,#FF4D6D)" }}
          aria-hidden
        />
        {/* faint scan-corner brackets */}
        <ScanCorner className="absolute left-6 top-24 h-8 w-8 text-cream/15" />
        <ScanCorner className="absolute right-6 top-24 h-8 w-8 rotate-90 text-cream/15" />

        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
          <span className="inline-block rounded-full border border-cream/20 px-3 py-1 text-xs font-semibold text-cream/80">
            Servd Partner Program
          </span>
          <h1 className="mt-5 font-heading text-4xl font-extrabold leading-tight sm:text-5xl">
            Earn recurring income by referring restaurants to Servd
          </h1>
          <p className="mt-4 text-lg text-cream/80">
            {program.firstYearPct}% commission the first year, then {program.lifetimePct}% for life —
            on every restaurant you bring on board.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={APPLY}
              className="btn-brand rounded-full px-7 py-3 text-base font-semibold text-white shadow-lg"
            >
              Become a partner
            </Link>
            <a href="#calculator" className="rounded-full px-6 py-3 text-base font-semibold text-cream/80 hover:text-cream">
              See what you could earn →
            </a>
          </div>
          <p className="mt-4 text-sm text-cream/55">Free to join · no earnings cap · paid monthly</p>
        </div>
      </section>

      {/* 2. How it works */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">How it works</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Step n={1} title="Join & get your link" body="Apply in minutes. Once approved you get a unique referral link to share." />
          <Step n={2} title="Refer restaurants" body="Share your link with restaurants. When they sign up and subscribe, they're yours." />
          <Step n={3} title="Earn every month" body="Get paid a recurring commission for as long as each restaurant keeps paying." />
        </div>
      </section>

      {/* 3. The commission */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">
          Commission that keeps paying
        </h2>
        <div className="mx-auto mt-8 grid max-w-3xl gap-5 sm:grid-cols-2">
          <div className="rounded-tile border-2 border-brand-primary/30 bg-white p-7">
            <p className="font-heading text-5xl font-extrabold text-brand-primary">{program.firstYearPct}%</p>
            <p className="mt-2 font-semibold">First {program.firstYearMonths} months</p>
            <p className="mt-1 text-sm text-plum-ink/60">
              On the referred restaurant&apos;s subscription for their entire first year.
            </p>
          </div>
          <div className="rounded-tile border border-plum-ink/10 bg-white p-7">
            <p className="font-heading text-5xl font-extrabold">{program.lifetimePct}%</p>
            <p className="mt-2 font-semibold">Every month after — for life</p>
            <p className="mt-1 text-sm text-plum-ink/60">
              Keep earning every month for as long as the restaurant stays subscribed.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Calculator */}
      <section id="calculator" className="mx-auto max-w-5xl px-6 pb-16">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">
          See what you could earn
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-plum-ink/55">
          Drag the slider and set an example plan price. This is an illustration, not a guarantee.
        </p>
        <div className="mt-8">
          <EarningsCalculator program={program} />
        </div>
      </section>

      {/* 5. Performance bonuses */}
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="text-center font-heading text-2xl font-bold sm:text-3xl">
          Performance bonuses
        </h2>
        <p className="mt-2 text-center text-sm text-plum-ink/55">
          One-time bonuses as you hit active-paying-referral milestones. They stack.
        </p>
        <div className="mt-6 overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full text-left">
            <thead className="bg-cream/60 text-sm text-plum-ink/55">
              <tr>
                <th className="px-5 py-3 font-semibold">Active paying referrals</th>
                <th className="px-5 py-3 text-right font-semibold">One-time bonus</th>
              </tr>
            </thead>
            <tbody>
              {program.bonusTiers.map((t) => {
                const top = t.activeReferrals === 250;
                return (
                  <tr
                    key={t.activeReferrals}
                    className={`border-t border-plum-ink/5 ${top ? "bg-brand-gradient text-white" : ""}`}
                  >
                    <td className="px-5 py-3 font-semibold">
                      {t.activeReferrals} {top && <span className="ml-1 text-xs font-bold">★ top tier</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-heading text-lg font-extrabold">
                      {formatPHP(t.bonusPesos)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Who it's for */}
      <section className="mx-auto max-w-4xl px-6 pb-16 text-center">
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">Who it&apos;s for</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {[
            "Freelancers",
            "Web / IT providers",
            "POS & hardware sellers",
            "Agencies",
            "Bookkeepers",
            "Food suppliers",
          ].map((c) => (
            <span
              key={c}
              className="rounded-full border border-plum-ink/15 bg-white px-4 py-2 text-sm font-medium text-plum-ink/75"
            >
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* 7. Final CTA band */}
      <section className="px-6 pb-16">
        <div
          className="mx-auto max-w-5xl rounded-tile px-8 py-12 text-center text-white"
          style={{ background: "linear-gradient(135deg,#FF9A2E,#FF7A1A,#FF4D6D)" }}
        >
          <h2 className="font-heading text-3xl font-extrabold">Start earning with Servd</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/90">
            Free to join, no cap on earnings, paid monthly via {program.payoutMethods.join(" or ")}.
          </p>
          <Link
            href={APPLY}
            className="mt-6 inline-block rounded-full bg-white px-7 py-3 text-base font-bold text-plum-ink shadow-lg hover:bg-cream"
          >
            Sign up as a partner
          </Link>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="border-t border-plum-ink/10 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-center gap-2">
            <AppIcon size={24} />
            <Wordmark size="1rem" />
          </div>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-plum-ink/45">
            Earnings shown are illustrative and not a guarantee. Commissions are paid on active,
            paid subscriptions and may be reversed if a referred restaurant refunds or cancels
            within the clawback window. Participation is subject to the Servd partner agreement.
          </p>
          <p className="mt-3 text-xs text-plum-ink/40">
            Already a partner?{" "}
            <Link href="/partner/login" className="font-semibold text-brand-primary">
              Log in
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
