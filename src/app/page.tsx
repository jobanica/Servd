import Link from "next/link";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { PlanCards } from "@/components/billing/PlanCards";
import { PlanComparisonTable } from "@/components/billing/PlanComparisonTable";
import { getPublicPricing } from "@/server/billing/public-catalog";

/* ------------------------------------------------------------------ icons */
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d={path} />
    </svg>
  );
}
const ICONS = {
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M20 18v2M14 20h2",
  bolt: "M13 2L3 14h7l-1 8 10-12h-7z",
  card: "M2 7h20v10H2zM2 11h20",
  brush: "M9 11l6-6 4 4-6 6M9 11l-3 7 7-3M9 11l3 3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  check: "M20 6L9 17l-5-5",
};

/* ------------------------------------------------------------------ nav */
function Nav() {
  const links = [
    ["Features", "#features"],
    ["How it works", "#how"],
    ["Pricing", "#pricing"],
    ["FAQ", "#faq"],
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-plum-ink/5 bg-cream/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <AppIcon size={32} />
          <Wordmark size="1.4rem" />
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          {links.map(([l, h]) => (
            <a key={h} href={h} className="text-sm font-medium text-plum-ink/70 hover:text-plum-ink">{l}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-plum-ink/80 hover:text-plum-ink">
            Staff login
          </Link>
          <Link href="/signup" className="rounded-full px-5 py-2 text-sm font-semibold btn-brand shadow-sm">
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------- phone mockup */
function PhoneMockup() {
  const items = [
    ["Smoky BBQ Burger", "₱290"],
    ["Truffle Fries", "₱180"],
    ["Mango Cheesecake", "₱160"],
  ];
  return (
    <div className="relative mx-auto w-[260px]">
      {/* floating "new order" chip */}
      <div className="absolute -left-10 top-24 hidden rounded-2xl border border-plum-ink/10 bg-white p-3 shadow-xl sm:block">
        <p className="text-[10px] font-semibold text-mango">● NEW ORDER · Table 7</p>
        <p className="mt-1 text-xs font-bold text-plum-ink">2× Smoky BBQ Burger</p>
      </div>
      {/* floating "paid" chip */}
      <div className="absolute -right-8 bottom-20 hidden rounded-2xl border border-plum-ink/10 bg-white p-3 shadow-xl sm:block">
        <p className="text-xs font-bold text-plum-ink">Paid via GCash ✓</p>
        <p className="text-[10px] text-plum-ink/50">₱630.00</p>
      </div>
      {/* device */}
      <div className="rounded-[2.5rem] border-[10px] border-plum-ink bg-white p-3 shadow-2xl">
        <div className="overflow-hidden rounded-[1.6rem] bg-cream">
          <div className="bg-brand-gradient px-4 pb-6 pt-5 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/25 font-bold">M</div>
              <div>
                <p className="text-sm font-bold leading-tight">Mango Grill</p>
                <p className="text-[10px] opacity-80">Table 7</p>
              </div>
            </div>
          </div>
          <div className="-mt-3 space-y-2 rounded-t-2xl bg-cream p-3">
            {items.map(([name, price]) => (
              <div key={name} className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg" style={{ background: "var(--brand-gradient)", opacity: 0.18 }} />
                  <span className="text-xs font-medium text-plum-ink">{name}</span>
                </div>
                <span className="text-xs font-bold text-plum-ink">{price}</span>
              </div>
            ))}
            <div className="mt-2 rounded-full py-2 text-center text-xs font-bold text-white btn-brand">
              View order · ₱630
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- browser mockups */
function BrowserFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-plum-ink/10 bg-cream/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-guava/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-mango/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-plum-ink/20" />
        <span className="ml-2 text-xs font-medium text-plum-ink/45">{title}</span>
      </div>
      {children}
    </div>
  );
}

function KitchenMock() {
  const cols: [string, [string, string, string][]][] = [
    ["New", [["Table 7", "2× Smoky BBQ Burger", "3m ago"], ["Table 3", "1× Truffle Fries", "1m ago"]]],
    ["Preparing", [["Table 12", "2× Mango Cheesecake", "6m ago"]]],
  ];
  return (
    <BrowserFrame title="Kitchen display · live">
      <div className="grid grid-cols-2 gap-3 p-4">
        {cols.map(([title, cards]) => (
          <div key={title}>
            <p className="mb-2 text-xs font-bold text-plum-ink/50">{title} ({cards.length})</p>
            <div className="space-y-2">
              {cards.map((c) => (
                <div key={c[0]} className="rounded-xl border border-plum-ink/10 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-sm font-extrabold">{c[0]}</span>
                    <span className="text-[10px] text-plum-ink/40">{c[2]}</span>
                  </div>
                  <p className="mt-1 text-xs text-plum-ink/70">{c[1]}</p>
                  <div className="mt-2 rounded-md py-1 text-center text-[10px] font-bold text-white btn-brand">
                    {title === "New" ? "Start preparing" : "Mark done"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

function AnalyticsMock() {
  const bars = [40, 65, 50, 80, 72, 95, 60];
  return (
    <BrowserFrame title="Analytics · last 7 days">
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {[["Revenue", "₱48.2k"], ["Orders", "312"], ["Avg rating", "4.8★"]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-cream/60 p-3">
              <p className="text-[10px] text-plum-ink/50">{l}</p>
              <p className="font-heading text-lg font-extrabold">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex h-28 items-end gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-md btn-brand" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ------------------------------------------------------------------ page */
export default async function Home() {
  const pricing = await getPublicPricing();
  const priceByTier = { Starter: pricing.Starter.pricePesos, Pro: pricing.Pro.pricePesos, Business: pricing.Business.pricePesos };

  return (
    <main className="bg-cream text-plum-ink">
      <Nav />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
              ✨ 30 days free — every feature unlocked
            </span>
            <h1 className="mt-5 font-heading text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              The QR ordering system that{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">grows your sales</span>.
            </h1>
            <p className="mt-5 max-w-md text-lg text-plum-ink/70">
              Diners scan, browse your branded menu, order, and pay — GCash or card.
              Orders hit the kitchen in real time. You keep every peso.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-full px-7 py-3.5 font-semibold btn-brand shadow-lg">
                Start free — 30 days
              </Link>
              <a href="#how" className="rounded-full border border-plum-ink/15 bg-white px-7 py-3.5 font-semibold">
                See how it works
              </a>
            </div>
            <p className="mt-4 text-sm text-plum-ink/50">
              All features free for 30 days · No card required · Set up in minutes
            </p>
          </div>
          <PhoneMockup />
        </div>
      </section>

      {/* LOGOS + INTEGRATIONS */}
      <section className="border-y border-plum-ink/5 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-plum-ink/35">
            Trusted by restaurants across the metro
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 font-heading text-lg font-extrabold text-plum-ink/30">
            <span>Mango Grill</span>
            <span>Guava Café</span>
            <span>Tito&apos;s BBQ</span>
            <span>Saka Kitchen</span>
            <span>Lola&apos;s Lutong Bahay</span>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <span className="text-xs text-plum-ink/40">Works with</span>
            {["GCash", "Visa · Mastercard", "PayMongo", "Semaphore SMS"].map((x) => (
              <span key={x} className="rounded-full border border-plum-ink/10 bg-cream px-3 py-1 text-xs font-semibold text-plum-ink/60">
                {x}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight">Everything your restaurant needs</h2>
          <p className="mt-3 text-plum-ink/70">One platform from the table to the kitchen to the books.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [ICONS.qr, "QR ordering", "Each table has its own QR. Diners browse, customize add-ons, and order — no app, no waiting."],
            [ICONS.bolt, "Real-time kitchen", "Orders appear instantly on the kitchen display, tagged to the table. Advance them with a tap."],
            [ICONS.card, "Online payment", "GCash & cards via PayMongo. Connected accounts mean funds go straight to you."],
            [ICONS.brush, "White-label", "Your logo, colors, and even your own domain. Diners see your brand, never ours."],
            [ICONS.chart, "Analytics", "Revenue, best-sellers, peak hours, payment mix, and feedback trends — exportable."],
            [ICONS.chat, "Feedback & SMS", "Collect ratings, invite Google reviews, and run opt-in SMS promos to regulars."],
            [ICONS.box, "Inventory", "Recipes auto-deduct stock as orders cook, with low-stock alerts and COGS."],
            [ICONS.check, "HR & payroll prep", "Employees, schedules, QR time-clock, leave, and payroll-prep exports."],
          ].map(([icon, title, body]) => (
            <div key={title} className="rounded-tile border border-plum-ink/10 bg-white p-6 transition hover:shadow-lg">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white">
                <Icon path={icon} />
              </div>
              <h3 className="mt-4 font-heading text-lg font-bold">{title}</h3>
              <p className="mt-1.5 text-sm text-plum-ink/65">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SHOWCASE */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight">See it in action</h2>
            <p className="mt-3 text-plum-ink/70">From the table to the kitchen to your numbers — all in real time.</p>
          </div>
          <div className="mt-12 grid items-start gap-6 lg:grid-cols-2">
            <div>
              <KitchenMock />
              <h3 className="mt-4 font-heading text-lg font-bold">Real-time kitchen display</h3>
              <p className="text-sm text-plum-ink/65">New orders appear instantly, tagged to the table. Staff advance them with a tap — no shouting, no paper chaos.</p>
            </div>
            <div>
              <AnalyticsMock />
              <h3 className="mt-4 font-heading text-lg font-bold">Know your numbers</h3>
              <p className="text-sm text-plum-ink/65">Revenue, best-sellers, peak hours, and ratings — so you can decide what to cook, staff, and promote.</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-plum-ink py-20 text-cream">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-4xl font-extrabold tracking-tight">Up and running in three steps</h2>
            <p className="mt-3 text-cream/60">Your diners already know how to do it.</p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              ["01", "Scan", "The diner scans the QR on their table — your branded menu opens instantly."],
              ["02", "Order", "They pick items and add-ons; the order lands on the kitchen screen in real time."],
              ["03", "Pay", "They pay online or at the counter, then leave a rating and a Google review."],
            ].map(([n, title, body]) => (
              <div key={n} className="relative rounded-tile border border-cream/10 bg-white/5 p-7">
                <span className="font-heading text-5xl font-extrabold text-mango/40">{n}</span>
                <h3 className="mt-2 font-heading text-xl font-bold">{title}</h3>
                <p className="mt-2 text-sm text-cream/65">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 rounded-tile bg-brand-gradient p-10 text-center text-white sm:grid-cols-3">
          {[
            ["Faster", "table turns with self-ordering"],
            ["0%", "of your sales taken — funds go to you"],
            ["1 platform", "menu, kitchen, payments, HR & stock"],
          ].map(([big, small]) => (
            <div key={small}>
              <p className="font-heading text-4xl font-extrabold">{big}</p>
              <p className="mt-1 text-sm text-white/85">{small}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight">Simple, honest pricing</h2>
          <p className="mt-3 text-plum-ink/70">
            Every plan starts with a 30-day free trial — <strong>all features unlocked</strong>,
            no card to start.
          </p>
        </div>
        <div className="mt-12">
          <PlanCards mode="signup" priceByTier={priceByTier} />
        </div>

        {/* Full feature comparison */}
        <div className="mt-12">
          <h3 className="mb-4 text-center font-heading text-2xl font-extrabold tracking-tight">
            Compare every feature
          </h3>
          <PlanComparisonTable limitsByTier={pricing} />
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="mx-auto max-w-3xl px-6 pb-20 text-center">
        <p className="font-heading text-2xl font-bold leading-snug sm:text-3xl">
          “Servd paid for itself in a week. Orders are faster, mistakes dropped, and
          our regulars love getting our promos by text.”
        </p>
        <p className="mt-5 text-sm font-semibold text-plum-ink/60">Maria · Owner, Mango Grill</p>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center font-heading text-4xl font-extrabold tracking-tight">Questions, answered</h2>
        <div className="mt-10 space-y-3">
          {[
            ["Do diners need to download an app?", "No. They scan the QR on the table and your menu opens in their browser — order and pay right there."],
            ["Where does the money go?", "Straight to your own PayMongo account. Servd uses connected accounts, so we never hold your funds."],
            ["Can I use my own branding?", "Yes — your logo, colors, tagline, and even your own domain. Diners only ever see your brand."],
            ["Is there a free trial?", "Yes — 30 days free with every feature unlocked (inventory, HR, custom domain, AI insights and more), and you don't need a card to start."],
            ["Does it work on iPad for the cashier?", "Yes. Printing supports cloud/poll printers and AirPrint so it works on any device."],
          ].map(([q, a]) => (
            <details key={q} className="group rounded-tile border border-plum-ink/10 bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                {q}
                <span className="text-plum-ink/40 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-plum-ink/65">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-tile bg-plum-ink px-8 py-14 text-center text-cream">
          <h2 className="font-heading text-4xl font-extrabold tracking-tight">Ready to serve smarter?</h2>
          <p className="mx-auto mt-3 max-w-md text-cream/70">
            Launch your QR ordering in minutes. Free for 30 days.
          </p>
          <Link href="/signup" className="mt-7 inline-block rounded-full px-8 py-3.5 font-semibold btn-brand shadow-lg">
            Start your restaurant
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-plum-ink/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <AppIcon size={28} />
              <Wordmark size="1.2rem" />
            </div>
            <p className="mt-3 max-w-xs text-sm text-plum-ink/55">
              QR ordering, payments, and back-office for modern restaurants.
            </p>
          </div>
          {[
            ["Product", [["Features", "#features"], ["Pricing", "#pricing"], ["Staff login", "/login"]]],
            ["Company", [["About", "#"], ["Contact", "#"], ["Blog", "#"]]],
            ["Legal", [["Privacy", "#"], ["Terms", "#"], ["SMS consent", "#"]]],
          ].map(([title, rows]) => (
            <div key={title as string}>
              <p className="font-heading font-bold">{title as string}</p>
              <ul className="mt-3 space-y-2 text-sm text-plum-ink/60">
                {(rows as string[][]).map(([l, h]) => (
                  <li key={l}><Link href={h} className="hover:text-plum-ink">{l}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-plum-ink/5 py-5 text-center text-xs text-plum-ink/40">
          © {new Date().getFullYear()} Servd. Made for restaurants in the Philippines.
        </div>
      </footer>
    </main>
  );
}
