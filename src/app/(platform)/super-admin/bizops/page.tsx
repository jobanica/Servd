import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getAcquisition, getRevenue, periodStart, type Period } from "@/server/bizops/queries";
import { listDueFollowUps } from "@/server/bizops/follow-ups";
import { fmtCount, fmtPeso, fmtRate, rate, type Maybe } from "@/lib/bizops/metrics";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business · Servd" };

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

/**
 * The 60-second view: who needs chasing, what came in, where it leaked.
 *
 * Every figure is derived from a record of something that actually happened —
 * a paid activation, a paid unlock, a live subscription. Nothing is multiplied
 * out from a remembered price, and anything without a source prints an em dash
 * rather than a zero, because a blank prompts a question and a wrong number
 * ends one.
 */
export default async function BizOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireSuperAdminPage();
  const { period: raw } = await searchParams;
  const period: Period = raw === "today" || raw === "month" ? raw : "week";
  const since = periodStart(period);

  const [revenue, acq, due] = await Promise.all([
    getRevenue(since),
    getAcquisition(since),
    listDueFollowUps(),
  ]);

  const overdue = due.filter((d) => d.overdue || !d.dueAt);
  const conversion = rate(acq.activated ?? 0, acq.diyRequested ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Business</h1>
          <p className="text-sm text-plum-ink/50">
            Who needs following up, what came in, and where the funnel is leaking.
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-plum-ink/5 p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/super-admin/bizops?period=${p.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                p.key === period ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* The one thing worth acting on, above everything else. */}
      <Link
        href="/super-admin/bizops/follow-ups"
        className="block rounded-tile border border-brand-primary/40 bg-brand-primary/5 p-5 transition hover:border-brand-primary"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-heading text-2xl font-extrabold text-brand-primary">
              {due.length} to follow up
            </p>
            <p className="mt-1 text-sm text-plum-ink/60">
              {overdue.length} overdue or never chased. Money on the table.
            </p>
          </div>
          <span className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Open Follow-Up Center →
          </span>
        </div>
      </Link>

      <Section title="Revenue collected">
        {revenue == null ? (
          <Unavailable what="Payment records couldn't be read" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total collected" value={fmtPeso(revenue.total)} big />
            <Stat
              label="Activations"
              value={fmtPeso(revenue.activations)}
              hint={`${revenue.activationCount} paid`}
            />
            <Stat
              label="Extra branches"
              value={fmtPeso(revenue.branches)}
              hint={`${revenue.branchCount} activated`}
            />
            <Stat
              label="Feature unlocks"
              value={fmtPeso(revenue.unlocks)}
              hint={`${revenue.unlockCount} bought`}
            />
          </div>
        )}
      </Section>

      <Section title="Recurring">
        {revenue == null ? (
          <Unavailable what="Subscription records couldn't be read" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="MRR" value={fmtPeso(revenue.mrr)} big />
            <Stat label="Active subscriptions" value={fmtCount(revenue.mrrCount)} />
            <div className="rounded-tile border border-plum-ink/10 bg-cream/40 p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
                Why MRR is small
              </p>
              <p className="mt-1 text-xs leading-relaxed text-plum-ink/60">
                Servd sells one-time unlocks, not monthly plans. The only recurring line in the
                product is the content scheduler, so this figure is the sum of live subscriptions
                to it — not a plan MRR. The money is in the row above.
              </p>
            </div>
          </div>
        )}
      </Section>

      <Section title="Acquisition">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="DIY previews started" value={fmtCount(acq.diyStarted)} />
          <Stat label="Activation requested" value={fmtCount(acq.diyRequested)} />
          <Stat label="Went live" value={fmtCount(acq.activated)} />
          <Stat
            label="Request → live"
            value={fmtRate(conversion)}
            hint={conversion == null ? "no requests in this window" : undefined}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat label="Outreach prospects added" value={fmtCount(acq.outreachAdded)} />
          <div className="rounded-tile border border-plum-ink/10 bg-cream/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
              Cost per lead
            </p>
            <p className="mt-1 font-heading text-lg font-bold text-plum-ink/30">—</p>
            <p className="text-xs text-plum-ink/50">
              Needs ad spend entry, which isn&apos;t built yet (Phase 3).
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 font-heading text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  big = false,
}: {
  label: string;
  value: string;
  hint?: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="text-xs font-medium text-plum-ink/50">{label}</p>
      <p className={`mt-1 font-heading font-extrabold ${big ? "text-3xl" : "text-2xl"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-plum-ink/40">{hint}</p>}
    </div>
  );
}

/** Said plainly rather than shown as zeroes. */
function Unavailable({ what }: { what: string }) {
  return (
    <div className="rounded-tile border border-mango/40 bg-mango/5 p-4">
      <p className="text-sm font-semibold text-plum-ink">{what}</p>
      <p className="mt-1 text-xs text-plum-ink/60">
        Showing nothing rather than zeroes. If this persists, run{" "}
        <code className="font-mono">prisma/manual/add-business-ops.sql</code>.
      </p>
    </div>
  );
}

export type { Maybe };
