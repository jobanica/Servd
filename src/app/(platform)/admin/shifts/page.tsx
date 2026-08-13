import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { listShiftHistory } from "@/server/orders/shift-history";
import { formatPeso } from "@/lib/money";
import { manilaShortDateTime, manilaTime } from "@/lib/time/manila";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_terminal: "Card",
  gcash: "GCash",
  maya: "Maya",
  online_gcash: "GCash (online)",
  online_card: "Card (online)",
  bank_transfer: "Bank transfer",
};

/**
 * Every shift that's been worked, and what each one took.
 *
 * There was no such record. A Z-report existed only while the shift was open,
 * so a figure that went missing — or a shift that ended before anyone printed
 * it — left nothing to check against but the dashboard, which answers a
 * different question and is not the cashier's drawer.
 *
 * Totals are recomputed from each shift's own payments every time this loads,
 * not read from something stamped at closing time. A stored total can't be
 * re-derived once it's wrong, and this page exists because one was.
 */
export default async function ShiftsPage() {
  const { restaurantId } = await requireAdminPage();
  const shifts = await listShiftHistory(restaurantId);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Shift history</h1>
        <p className="text-sm text-plum-ink/50">
          What each cashier took on each turn at the till, and what should have been in the
          drawer at the end of it.
        </p>
      </div>

      {shifts.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center text-sm text-plum-ink/45">
          No shifts recorded yet. One opens by itself the first time a cashier settles an order.
        </p>
      ) : (
        <ul className="space-y-3">
          {shifts.map((s) => (
            <li key={s.id} className="min-w-0 rounded-tile border border-plum-ink/10 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-plum-ink/10 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-heading font-bold text-plum-ink">
                    {s.cashier}
                    {s.open && (
                      <span className="rounded-full bg-mango/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-ink">
                        On now
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-plum-ink/50">
                    {manilaShortDateTime(s.openedAt)}
                    {" → "}
                    {s.closedAt ? manilaTime(s.closedAt) : "still open"}
                    {/* A shift nobody signed out of is worth flagging: the
                        closing figures are whatever it had when it lapsed. */}
                    {s.closedReason?.startsWith("auto_") && (
                      <span className="text-guava"> · not signed out</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-xl font-extrabold tabular-nums text-plum-ink">
                    {formatPeso(s.gross)}
                  </p>
                  <p className="text-[11px] text-plum-ink/45">
                    {s.orderCount} order{s.orderCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
                    By payment method
                  </p>
                  {s.byMethod.length === 0 ? (
                    <p className="text-sm text-plum-ink/45">Nothing taken.</p>
                  ) : (
                    <ul className="space-y-0.5 text-sm">
                      {s.byMethod.map((m) => (
                        <li key={m.method} className="flex justify-between gap-2">
                          <span className="truncate text-plum-ink/70">
                            {METHOD_LABEL[m.method] ?? m.method} ({m.count})
                          </span>
                          <span className="tabular-nums font-medium">{formatPeso(m.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
                    Cash drawer
                  </p>
                  <ul className="space-y-0.5 text-sm">
                    <li className="flex justify-between gap-2">
                      <span className="text-plum-ink/70">Cash collected</span>
                      <span className="tabular-nums">{formatPeso(s.cashCollected)}</span>
                    </li>
                    {s.cashOutTotal > 0 && (
                      <li className="flex justify-between gap-2">
                        <span className="text-plum-ink/70">Cash taken out</span>
                        <span className="tabular-nums">−{formatPeso(s.cashOutTotal)}</span>
                      </li>
                    )}
                    <li className="flex justify-between gap-2 border-t border-plum-ink/10 pt-0.5 font-bold">
                      <span>Expected in drawer</span>
                      <span className="tabular-nums">{formatPeso(s.expectedCash)}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
