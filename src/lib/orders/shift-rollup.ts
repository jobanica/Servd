/**
 * Turning one shift's payment rows into the figures on the Z-report.
 *
 * Pure, so the arithmetic a cashier counts their drawer against can be tested
 * without a database. The subtle part is the order count: a bill split across
 * three tenders is ONE order, and counting it three times would make a busy
 * shift look busier than it was and quietly break the average-order figure the
 * owner reads off it.
 */

export interface ShiftPaymentRow {
  amount: number; // centavos
  method: string;
  orderId: string;
}

export interface ShiftRollup {
  gross: number;
  /** Distinct orders settled, not the number of tenders taken. */
  orderCount: number;
  /** Every order this shift touched — the caller sums discounts over these. */
  orderIds: string[];
  byMethod: { method: string; amount: number; count: number }[];
}

export function rollupShiftPayments(rows: ShiftPaymentRow[]): ShiftRollup {
  let gross = 0;
  const orderIds = new Set<string>();
  const byMethod = new Map<string, { amount: number; count: number }>();

  for (const p of rows) {
    gross += p.amount;
    orderIds.add(p.orderId);
    const m = byMethod.get(p.method) ?? { amount: 0, count: 0 };
    // count = tenders taken by this method, which is what a cashier reconciles
    // against: three cash payments is three times they opened the drawer.
    byMethod.set(p.method, { amount: m.amount + p.amount, count: m.count + 1 });
  }

  return {
    gross,
    orderCount: orderIds.size,
    orderIds: [...orderIds],
    // Biggest first: the method that matters most is at the top of the paper.
    byMethod: [...byMethod.entries()]
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/**
 * What should physically be in the drawer.
 *
 * The fund the shift opened with, plus the cash taken, less the cash removed.
 * The opening fund is the term that used to be missing, and it made the figure
 * wrong for every till that keeps change on hand: open with ₱1,000, take
 * ₱3,000, and the drawer holds ₱4,000 while the report said ₱3,000 — so the
 * count never agreed and the number stopped being worth checking.
 *
 * `openingFloat` is null on a shift opened before anyone was asked for one.
 * Counted as zero here, which restores exactly the old arithmetic for those,
 * while the summary shows it as "not counted" rather than as an actual zero.
 *
 * Still floored at zero: a negative expectation is a data problem, and putting
 * one on a report someone signs invites them to hand over money they don't have.
 */
export function expectedCash(
  openingFloat: number | null,
  cashCollected: number,
  cashOutTotal: number,
): number {
  return Math.max(0, (openingFloat ?? 0) + cashCollected - cashOutTotal);
}
