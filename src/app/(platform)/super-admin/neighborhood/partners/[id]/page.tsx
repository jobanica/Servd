import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getPartner, orderingUrl, partnerName, partnerPerformance } from "@/server/neighborhood/queries";
import {
  addAdjustment,
  generateStatementAction,
  recordActivation,
  saveCampaign,
  setCommercialTrack,
  syncNow,
  updateAgreement,
} from "@/server/neighborhood/actions";
import { NbChrome, input, label, btn, btnGhost, card } from "@/components/super-admin/neighborhood/NbChrome";
import { formatPeso } from "@/lib/money";
import { costPerHousehold, formatRate, magnetUrl, manilaDate, manilaMonth, previousMonth } from "@/lib/neighborhood/commission";

export const dynamic = "force-dynamic";

const dayValue = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const instantDay = (d: Date | null | undefined) => (d ? manilaDate(d) : "");

export default async function PartnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperAdminPage();
  const { id } = await params;
  const flash = await searchParams;
  const [p, perf] = await Promise.all([getPartner(id), partnerPerformance(id)]);
  if (!p || !perf) notFound();

  const back = `/super-admin/neighborhood/partners/${p.id}`;
  const name = partnerName(p.restaurant);
  const page = orderingUrl(p.restaurant);
  const magnet = magnetUrl(page, p.territoryId);
  const qr = await QRCode.toDataURL(magnet, { margin: 1, width: 360 });
  const thisMonth = manilaMonth();
  const months = [previousMonth(thisMonth), thisMonth, previousMonth(previousMonth(thisMonth))];

  return (
    <div className="space-y-6">
      <NbChrome active="partners" title={name} intro={`${p.territory.name} · ${p.category}${p.exclusive ? " · exclusive" : ""} · ${formatRate(p.commissionRateBps)}`} flash={flash} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Commission earned" value={formatPeso(perf.commissionEarned)} />
        <Tile label="Gross orders (commissionable)" value={formatPeso(perf.gross)} />
        <Tile label="Average order" value={formatPeso(perf.averageOrder)} />
        <Tile label="Repeat customers" value={perf.repeatRate == null ? "—" : `${perf.repeatRate}% of ${perf.customers}`} />
      </div>

      <section className={card}>
        <h2 className="font-heading font-bold">Payback</h2>
        <p className="mt-1 text-sm">
          {perf.payback.reached ? (
            <span className="font-semibold text-green-700">✓ Paid back — commission {formatPeso(perf.payback.earned)} ≥ activation + magnets {formatPeso(perf.payback.target)}</span>
          ) : (
            <span>
              {formatPeso(perf.payback.earned)} of {formatPeso(perf.payback.target)} (activation fee + magnet cost) —{" "}
              <strong>{formatPeso(perf.payback.remaining)}</strong> to go
            </span>
          )}
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-plum-ink/50">
            <tr><th className="py-1">Month</th><th>Orders</th><th>Gross</th><th>Commission</th></tr>
          </thead>
          <tbody className="divide-y divide-plum-ink/5">
            {perf.trend.map((t) => (
              <tr key={t.month}>
                <td className="py-1.5">{t.month}</td>
                <td>{t.orders}</td>
                <td>{formatPeso(t.gross)}</td>
                <td>{formatPeso(t.commission)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Agreement</h2>
        <form action={updateAgreement} className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="id" value={p.id} />
          <label>
            <span className={label}>Status</span>
            <select name="status" defaultValue={p.status} className={`${input} w-full`}>
              {["pending", "active", "paused", "ended"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span className={label}>Commission rate (%)</span>
            <input name="ratePercent" type="number" min={0} max={100} step="0.01" defaultValue={p.commissionRateBps / 100} className={`${input} w-full`} />
          </label>
          <label>
            <span className={label}>Activation fee (₱)</span>
            <input name="activationFee" type="number" min={0} step="0.01" defaultValue={p.activationFee / 100} className={`${input} w-full`} />
          </label>
          <label>
            <span className={label}>Starts</span>
            <input name="startsOn" type="date" required defaultValue={dayValue(p.startsOn)} className={`${input} w-full`} />
          </label>
          <label>
            <span className={label}>Ends</span>
            <input name="endsOn" type="date" defaultValue={dayValue(p.endsOn)} className={`${input} w-full`} />
          </label>
          <label className="flex items-end gap-2 pb-1.5 text-sm">
            <input type="checkbox" name="exclusive" defaultChecked={p.exclusive} /> Exclusive
          </label>
          <label className="sm:col-span-3">
            <span className={label}>Notes</span>
            <input name="notes" defaultValue={p.notes ?? ""} className={`${input} w-full`} />
          </label>
          <div className="sm:col-span-3">
            <button className={btn}>Save agreement</button>
            <span className="ml-2 text-xs text-plum-ink/50">A new rate applies to orders from now on; past entries keep theirs.</span>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-plum-ink/5 pt-3 text-sm">
          <span>
            Track: <strong>{p.restaurant.commercialTrack}</strong>
          </span>
          <form action={setCommercialTrack}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="restaurantId" value={p.restaurant.id} />
            <input type="hidden" name="track" value={p.restaurant.commercialTrack === "neighborhood" ? "standard" : "neighborhood"} />
            <button className={btnGhost}>
              {p.restaurant.commercialTrack === "neighborhood" ? "Move back to standard" : "Move to neighborhood"}
            </button>
          </form>
          <a href={page} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-primary">Ordering page ↗</a>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Activation fee — {formatPeso(p.activationFee)}</h2>
        {p.activationPaidAt ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-green-700">
              ✓ Paid {manilaDate(p.activationPaidAt)}{p.activationMethod ? ` · ${p.activationMethod}` : ""}{p.activationRef ? ` · ${p.activationRef}` : ""}
            </span>
            <form action={recordActivation}>
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="clear" value="1" />
              <button className={btnGhost}>Mark unpaid</button>
            </form>
          </div>
        ) : (
          <form action={recordActivation} className="mt-2 flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="id" value={p.id} />
            <input name="paidOn" type="date" required defaultValue={manilaDate(new Date())} className={input} />
            <select name="method" className={input} defaultValue="gcash">
              <option value="gcash">GCash</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
            <input name="ref" placeholder="Reference" className={`${input} w-36`} />
            <button className={btn}>Mark paid</button>
          </form>
        )}
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">QR magnets &amp; distribution</h2>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Magnet QR code" className="h-36 w-36 rounded-lg border border-plum-ink/10" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-plum-ink/60">The magnet&apos;s link — the partner&apos;s ordering page, tagged so magnet orders can be counted:</p>
            <p className="mt-1 break-all rounded bg-plum-ink/5 px-2 py-1 font-mono text-xs">{magnet}</p>
            <a href={qr} download={`magnet-${p.restaurant.slug}.png`} className="mt-2 inline-block text-xs font-semibold text-brand-primary">Download QR (PNG)</a>
            <p className="mt-3 text-plum-ink/70">
              <strong>{perf.magnetOrders}</strong> magnet orders from <strong>{perf.magnets}</strong> magnets
              {perf.ordersPer100Magnets != null && <> — <strong>{perf.ordersPer100Magnets}</strong> per 100 magnets</>}.
            </p>
            <p className="text-xs text-plum-ink/45">Attribution measures the campaign. Commission is owed on every platform order regardless of where it came from.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {p.campaigns.map((c, i) => {
            const cph = costPerHousehold(c);
            return (
              <details key={c.id} className="rounded-lg border border-plum-ink/10 p-3" open={i === 0}>
                <summary className="cursor-pointer text-sm font-semibold">
                  {c.quantity} magnets · {c.distributionCompletedAt ? `distributed ${manilaDate(c.distributionCompletedAt)}` : c.printedAt ? "printed" : "planned"}
                  {cph != null && <span className="font-normal text-plum-ink/60"> · {formatPeso(cph)} per household</span>}
                </summary>
                <CampaignForm back={back} partnerId={p.id} c={c} />
              </details>
            );
          })}
          <details className="rounded-lg border border-dashed border-plum-ink/20 p-3" open={p.campaigns.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">+ Add a campaign</summary>
            <CampaignForm back={back} partnerId={p.id} />
          </details>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-heading font-bold">Commission</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <form action={syncNow}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="partnerId" value={p.id} />
            <button className={btnGhost}>Sync completed orders now</button>
          </form>
          <Link href={`/super-admin/neighborhood/ledger?partner=${p.id}`} className={btnGhost}>Open this partner&apos;s ledger</Link>
        </div>

        <form action={generateStatementAction} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="partnerId" value={p.id} />
          <label>
            <span className={label}>Statement month</span>
            <select name="month" className={input} defaultValue={months[0]}>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <button className={btn}>Build draft statement</button>
        </form>

        <form action={addAdjustment} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="partnerId" value={p.id} />
          <label>
            <span className={label}>Adjustment (₱, negative = credit)</span>
            <input name="amount" type="number" step="0.01" required className={`${input} w-40`} />
          </label>
          <label className="min-w-0 flex-1">
            <span className={label}>Reason</span>
            <input name="note" required placeholder="Correction to the September statement" className={`${input} w-full`} />
          </label>
          <button className={btnGhost}>Add adjustment</button>
        </form>

        <h3 className="mt-5 text-sm font-semibold">Statements</h3>
        {p.statements.length === 0 ? (
          <p className="text-sm text-plum-ink/50">None yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-plum-ink/5 text-sm">
            {p.statements.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-1.5">
                <Link href={`/super-admin/neighborhood/statements/${s.id}`} className="font-semibold text-brand-primary">
                  {s.periodStart.toISOString().slice(0, 7)}
                </Link>
                <span className="capitalize text-plum-ink/70">{s.status.replace("_", " ")}</span>
                <span>{s.orderCount} orders</span>
                <span className="font-semibold">{formatPeso(s.commissionDue)}</span>
                {s.amountPaid > 0 && <span className="text-plum-ink/60">paid {formatPeso(s.amountPaid)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label: l, value }: { label: string; value: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-semibold text-plum-ink/50">{l}</p>
      <p className="font-heading text-xl font-extrabold">{value}</p>
    </div>
  );
}

function CampaignForm({
  back,
  partnerId,
  c,
}: {
  back: string;
  partnerId: string;
  c?: {
    id: string;
    quantity: number;
    printedAt: Date | null;
    distributionStartedAt: Date | null;
    distributionCompletedAt: Date | null;
    householdsCovered: number | null;
    unitCost: number | null;
    distributor: string | null;
    notes: string | null;
  };
}) {
  return (
    <form action={saveCampaign} className="mt-3 grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="partnerId" value={partnerId} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <label>
        <span className={label}>Magnets</span>
        <input name="quantity" type="number" min={0} defaultValue={c?.quantity ?? 500} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Unit cost (₱)</span>
        <input name="unitCost" type="number" min={0} step="0.01" defaultValue={c?.unitCost != null ? c.unitCost / 100 : ""} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Households covered</span>
        <input name="householdsCovered" type="number" min={0} defaultValue={c?.householdsCovered ?? ""} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Distributor</span>
        <input name="distributor" defaultValue={c?.distributor ?? ""} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Printed</span>
        <input name="printedAt" type="date" defaultValue={instantDay(c?.printedAt)} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Distribution started</span>
        <input name="distributionStartedAt" type="date" defaultValue={instantDay(c?.distributionStartedAt)} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Distribution completed</span>
        <input name="distributionCompletedAt" type="date" defaultValue={instantDay(c?.distributionCompletedAt)} className={`${input} w-full`} />
      </label>
      <label>
        <span className={label}>Notes</span>
        <input name="notes" defaultValue={c?.notes ?? ""} className={`${input} w-full`} />
      </label>
      <div className="sm:col-span-4">
        <button className={btn}>{c ? "Save campaign" : "Add campaign"}</button>
      </div>
    </form>
  );
}
