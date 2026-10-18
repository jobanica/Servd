import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getRiderReport } from "@/server/rider/report";
import { manilaDate, manilaDayStart } from "@/lib/rider/rider";
import { formatPeso } from "@/lib/money";

export const dynamic = "force-dynamic";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const methodLabel = (m: string) => (m === "cash" ? "💵 Cash" : m === "gcash" ? "📱 GCash" : "✅ Paid online");

/** The owner's rider report: per rider, deliveries and cash/GCash collected on a day. */
export default async function RidersPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "onlineOrdering", "Riders");
  if (locked) return locked;

  const { day: dayParam } = await searchParams;
  const today = manilaDate();
  const day = manilaDayStart(dayParam) ? dayParam! : today;
  const report = await getRiderReport(restaurantId, manilaDayStart(day)!);
  const t = report.total;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Riders</h1>
        <p className="text-sm text-plum-ink/55">
          What each rider delivered and collected. Riders use the Rider app at{" "}
          <strong>/rider</strong> — add one under{" "}
          <Link href="/admin/staff" className="font-semibold text-brand-primary">
            Staff &amp; access
          </Link>{" "}
          with the <strong>Rider</strong> role.
        </p>
      </div>

      <form className="flex items-center gap-2">
        <input type="date" name="day" defaultValue={day} max={today} className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        <button className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm font-semibold">Show</button>
        {day !== today && (
          <Link href="/admin/riders" className="text-sm font-semibold text-brand-primary">
            Today
          </Link>
        )}
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Delivered" value={String(t.delivered)} />
        <Tile label="💵 Cash" value={formatPeso(t.cash)} />
        <Tile label="📱 GCash" value={formatPeso(t.gcash)} />
        <Tile label="Total collected" value={formatPeso(t.collected)} />
      </div>

      {day === today && report.onTheWay.length > 0 && (
        <section className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <h2 className="font-heading font-bold">🛵 On the way now</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {report.onTheWay.map((o) => (
              <li key={o.id}>
                <span className="font-semibold">{o.riderName}</span> — {o.customerName ?? "Customer"}{" "}
                <span className="text-plum-ink/40">{o.ref}</span>
                {o.since && <span className="text-plum-ink/50"> · left {time(o.since)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.riders.length === 0 ? (
        <p className="text-sm text-plum-ink/50">No rider deliveries on this day.</p>
      ) : (
        report.riders.map((r) => (
          <section key={r.riderId} className="rounded-tile border border-plum-ink/10 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">{r.name}</h2>
              <p className="text-sm text-plum-ink/70">
                {r.summary.delivered} delivered · Cash <strong>{formatPeso(r.summary.cash)}</strong> · GCash{" "}
                <strong>{formatPeso(r.summary.gcash)}</strong>
              </p>
            </div>
            <ul className="mt-3 divide-y divide-plum-ink/5 text-sm">
              {r.rows.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2">
                  <span className="w-16 shrink-0 text-plum-ink/50">{time(d.deliveredAt)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {d.customerName ?? "Customer"} <span className="text-plum-ink/40">{d.ref}</span>
                  </span>
                  <span className="shrink-0 text-plum-ink/70">{methodLabel(d.method)}</span>
                  {d.receiptUrl && (
                    <a href={d.receiptUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold text-brand-primary">
                      Receipt
                    </a>
                  )}
                  <span className="w-20 shrink-0 text-right font-semibold">{d.collected > 0 ? formatPeso(d.collected) : "—"}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-3">
      <p className="text-xs font-semibold text-plum-ink/50">{label}</p>
      <p className="font-heading text-xl font-extrabold">{value}</p>
    </div>
  );
}
