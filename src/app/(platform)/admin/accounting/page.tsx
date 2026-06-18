import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { requireFeaturePage } from "@/server/billing/feature-gate";
import { getSalesReport, getVatReport, getCogs, getExpenses } from "@/server/accounting/queries";
import { formatPeso } from "@/lib/money";

type Period = "today" | "this" | "last";
function range(p: Period) {
  const now = new Date();
  if (p === "today") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    return { from, to: now };
  }
  const y = now.getFullYear();
  const m = now.getMonth() - (p === "last" ? 1 : 0);
  const from = new Date(y, m, 1);
  const to = p === "last" ? new Date(y, m + 1, 0, 23, 59, 59) : now;
  return { from, to };
}
const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", card_terminal: "Card (terminal)", online_gcash: "GCash (online)", online_card: "Card (online)",
};

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { restaurantId } = await requireAdminPage();
  await requireFeaturePage(restaurantId, "accounting");
  const sp = await searchParams;
  const period = (sp.period === "last" ? "last" : sp.period === "today" ? "today" : "this") as Period;
  const { from, to } = range(period);

  const [sales, vat, cogs, expenses] = await Promise.all([
    getSalesReport(restaurantId, from, to),
    getVatReport(restaurantId, from, to),
    getCogs(restaurantId, from, to),
    getExpenses(restaurantId, from, to),
  ]);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = sales.gross - cogs - expenseTotal;

  const tab = (p: Period, label: string) => (
    <Link href={`/admin/accounting?period=${p}`} className={`rounded-full px-3 py-1 text-sm font-semibold ${period === p ? "btn-brand text-white" : "border border-plum-ink/15"}`}>{label}</Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
          <h1 className="font-heading text-2xl font-bold">Accounting</h1>
          <p className="text-sm text-plum-ink/50">{from.toLocaleDateString()} – {to.toLocaleDateString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab("today", "Today")}{tab("this", "This month")}{tab("last", "Last month")}
          <Link href="/admin/accounting/expenses" className="rounded-full border border-plum-ink/15 px-3 py-1 text-sm font-semibold">Expenses →</Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Gross sales" value={formatPeso(sales.gross)} hint={`${sales.orderCount} orders`} />
        <Kpi label="Discounts" value={formatPeso(sales.discounts)} />
        <Kpi label="Expenses" value={formatPeso(expenseTotal)} />
        <Kpi label="Net profit" value={formatPeso(profit)} hint="Sales − COGS − expenses" accent={profit < 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Payment mix */}
        <Card title="Sales by payment method">
          {sales.byMethod.length === 0 ? <Empty /> : (
            <ul className="space-y-2 text-sm">
              {sales.byMethod.map((m) => (
                <li key={m.method} className="flex justify-between">
                  <span>{METHOD_LABEL[m.method] ?? m.method} <span className="text-plum-ink/40">×{m.count}</span></span>
                  <span className="font-semibold">{formatPeso(m.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* VAT */}
        <Card title="VAT (12%)">
          <dl className="space-y-1.5 text-sm">
            <Row k="Total sales" v={formatPeso(vat.totalSales)} />
            <Row k="VAT-exempt (Senior/PWD)" v={formatPeso(vat.exemptSales)} />
            <Row k="VATable sales (gross)" v={formatPeso(vat.vatableGross)} />
            <Row k="Net of VAT" v={formatPeso(vat.netOfVat)} />
            <Row k="VAT" v={formatPeso(vat.vat)} bold />
          </dl>
        </Card>
      </div>

      {/* P&L */}
      <Card title="Profit & Loss">
        <dl className="space-y-1.5 text-sm">
          <Row k="Revenue (sales)" v={formatPeso(sales.gross)} />
          <Row k="Cost of goods sold (inventory)" v={`−${formatPeso(cogs)}`} />
          <Row k="Operating expenses" v={`−${formatPeso(expenseTotal)}`} />
          <Row k="Net profit" v={formatPeso(profit)} bold />
        </dl>
        <p className="mt-2 text-xs text-plum-ink/45">COGS reflects recorded inventory usage; statutory taxes are not deducted here.</p>
      </Card>

      {/* Z-report (daily) */}
      <Card title="Daily sales (Z-report)">
        {sales.byDay.length === 0 ? <Empty /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50"><tr><th className="py-1">Date</th><th className="text-right">Orders</th><th className="text-right">Sales</th></tr></thead>
            <tbody>
              {sales.byDay.map((d) => (
                <tr key={d.day} className="border-t border-plum-ink/5">
                  <td className="py-1.5">{new Date(d.day).toLocaleDateString()}</td>
                  <td className="text-right">{d.orders}</td>
                  <td className="text-right font-semibold">{formatPeso(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-tile border p-5 ${accent ? "border-guava bg-guava/5" : "border-plum-ink/10 bg-white"}`}>
      <p className="text-xs font-medium text-plum-ink/50">{label}</p>
      <p className={`mt-1 font-heading text-2xl font-extrabold ${accent ? "text-guava" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-plum-ink/40">{hint}</p>}
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">{title}</h2>
      {children}
    </div>
  );
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "border-t border-plum-ink/10 pt-1.5 font-heading font-bold" : ""}`}>
      <dt className="text-plum-ink/60">{k}</dt><dd>{v}</dd>
    </div>
  );
}
function Empty() {
  return <p className="py-4 text-center text-sm text-plum-ink/40">No data for this period.</p>;
}
