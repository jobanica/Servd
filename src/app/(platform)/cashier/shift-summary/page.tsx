import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { getShiftSummary } from "@/server/orders/shift-summary";
import { formatPeso } from "@/lib/money";
import { AutoPrint } from "@/components/cashier/AutoPrint";

/** Printable end-of-shift summary (auto-fires the print dialog). */
export default async function ShiftSummaryPrintPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }
  const s = await getShiftSummary();
  if (!s) redirect("/cashier");

  const row = "flex justify-between py-0.5";

  return (
    <div className="mx-auto max-w-[320px] bg-white p-4 font-mono text-sm text-black">
      <AutoPrint />
      <p className="text-center font-bold">END-OF-SHIFT SUMMARY</p>
      <p className="text-center text-xs">{new Date(s.from).toLocaleDateString()}</p>
      <p className="mt-1 text-center text-xs">Cashier: {s.cashier}</p>
      <p className="text-center text-xs">
        Printed {new Date().toLocaleString([], { hour: "2-digit", minute: "2-digit" })}
      </p>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="font-bold">SALES</p>
      <div className={row}><span>Orders paid</span><span>{s.orderCount}</span></div>
      {s.byMethod.map((m) => (
        <div key={m.label} className={row}>
          <span>{m.label} ({m.count})</span><span>{formatPeso(m.amount)}</span>
        </div>
      ))}
      {s.discounts > 0 && (
        <div className={row}><span>Discounts given</span><span>-{formatPeso(s.discounts)}</span></div>
      )}
      <div className={`${row} font-bold`}><span>Gross sales</span><span>{formatPeso(s.gross)}</span></div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="font-bold">EXPENSES</p>
      {s.expenses.length === 0 ? (
        <p className="text-xs">None recorded today.</p>
      ) : (
        s.expenses.map((e, i) => (
          <div key={i} className={row}>
            <span>{e.category}{e.note ? ` · ${e.note}` : ""}</span><span>{formatPeso(e.amount)}</span>
          </div>
        ))
      )}
      <div className={`${row} font-bold`}><span>Total expenses</span><span>{formatPeso(s.expensesTotal)}</span></div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="font-bold">CASH DRAWER</p>
      <div className={row}><span>Cash collected</span><span>{formatPeso(s.cashCollected)}</span></div>
      {s.cashOuts.map((c, i) => (
        <div key={i} className={row}>
          <span>Cash out{c.note ? ` · ${c.note}` : ""}</span><span>-{formatPeso(c.amount)}</span>
        </div>
      ))}
      <div className={`${row} font-bold`}><span>Expected in drawer</span><span>{formatPeso(s.expectedCash)}</span></div>

      <div className="my-2 border-t border-black" />
      <div className={`${row} text-base font-extrabold`}>
        <span>NET</span><span>{formatPeso(s.net)}</span>
      </div>
      <p className="mt-3 text-center text-xs">Sales − expenses. Have a good rest! 👋</p>
    </div>
  );
}
