import Link from "next/link";
import { notFound } from "next/navigation";
import { AppIcon, Wordmark } from "@/components/Wordmark";
import { PrintButton } from "@/components/super-admin/PrintButton";
import { getPayoutStatement, type StatementLine } from "@/server/partners/statements";
import { formatPeso } from "@/lib/money";

export const metadata = { title: "Payout statement · Servd" };

function LineRows({ lines }: { lines: StatementLine[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <tr key={i} className="border-t border-plum-ink/10">
          <td className="py-2 pr-3">{l.label}</td>
          <td className="py-2 pr-3 text-plum-ink/55">{l.detail}</td>
          <td className="py-2 text-right font-medium">{formatPeso(l.amount)}</td>
        </tr>
      ))}
    </>
  );
}

export default async function PayoutStatementPage({
  params,
}: {
  params: Promise<{ payoutId: string }>;
}) {
  const { payoutId } = await params;
  const s = await getPayoutStatement(payoutId);
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-2 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/super-admin/partners" className="text-sm text-plum-ink/50">
          ← Partners
        </Link>
        <PrintButton />
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-8 print:border-0 print:p-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppIcon size={28} />
            <Wordmark size="1.2rem" />
          </div>
          <div className="text-right">
            <p className="font-heading text-lg font-bold">Payout statement</p>
            <p className="text-sm text-plum-ink/55">Period {s.period}</p>
          </div>
        </div>

        {/* Partner + payout meta */}
        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/40">Partner</p>
            <p className="font-semibold">{s.partner.name}</p>
            <p className="text-plum-ink/60">{s.partner.email}</p>
            <p className="text-plum-ink/60 capitalize">{s.partner.tier}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/40">Payout</p>
            <p className="text-plum-ink/60">
              Method: {s.partner.payoutMethod ?? "—"}
              {s.partner.payoutDetails ? ` · ${s.partner.payoutDetails}` : ""}
            </p>
            <p className="text-plum-ink/60">Status: {s.status}</p>
            <p className="text-plum-ink/60">
              {s.paidAt ? `Paid ${s.paidAt.toLocaleDateString()}` : `Created ${s.createdAt.toLocaleDateString()}`}
            </p>
            {s.partner.taxInfo && <p className="text-plum-ink/60">Tax info: {s.partner.taxInfo}</p>}
          </div>
        </div>

        {/* Line items */}
        <table className="mt-6 w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-plum-ink/40">
            <tr>
              <th className="pb-1">Item</th>
              <th className="pb-1">Detail</th>
              <th className="pb-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <LineRows lines={s.commissionLines} />
            <LineRows lines={s.bonusLines} />
            {s.commissionLines.length + s.bonusLines.length === 0 && (
              <tr className="border-t border-plum-ink/10">
                <td colSpan={3} className="py-3 text-center text-plum-ink/50">
                  No line items.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-plum-ink/60">Gross</span>
            <span className="font-medium">{formatPeso(s.gross)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-plum-ink/60">Withholding ({s.withholdingPct}%)</span>
            <span className="font-medium">−{formatPeso(s.withholding)}</span>
          </div>
          <div className="flex justify-between border-t border-plum-ink/15 pt-1">
            <span className="font-heading font-bold">Net payable</span>
            <span className="font-heading text-lg font-extrabold">{formatPeso(s.net)}</span>
          </div>
        </div>

        {/* Compliance note */}
        <p className="mt-8 border-t border-plum-ink/10 pt-3 text-[11px] leading-relaxed text-plum-ink/45">
          For record-keeping. Commissions are paid on active, paid subscriptions and may be reversed
          within the clawback window. Withholding shown is a configured rate, not tax advice —
          confirm the correct Philippine withholding/reporting treatment with an accountant.
        </p>
      </div>
    </div>
  );
}
