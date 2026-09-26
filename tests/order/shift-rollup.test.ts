import { describe, it, expect } from "vitest";
import { rollupShiftPayments, expectedCash } from "@/lib/orders/shift-rollup";

/**
 * The figures a cashier counts their drawer against at the end of a turn.
 */

const p = (amount: number, method: string, orderId: string) => ({ amount, method, orderId });

describe("rollupShiftPayments", () => {
  it("totals the takings and splits them by method", () => {
    const r = rollupShiftPayments([
      p(30000, "cash", "o1"),
      p(15000, "gcash", "o2"),
      p(20000, "cash", "o3"),
    ]);
    expect(r.gross).toBe(65000);
    expect(r.byMethod).toEqual([
      { method: "cash", amount: 50000, count: 2 },
      { method: "gcash", amount: 15000, count: 1 },
    ]);
  });

  // A bill split across three tenders is ONE order. Counting it three times
  // would make a quiet shift look busy and skew the average order value the
  // owner reads off this.
  it("counts a split bill as one order, not three", () => {
    const r = rollupShiftPayments([
      p(10000, "cash", "o1"),
      p(10000, "gcash", "o1"),
      p(5000, "card_terminal", "o1"),
    ]);
    expect(r.orderCount).toBe(1);
    expect(r.gross).toBe(25000);
  });

  // …but the per-method COUNT is tenders, which is what reconciling a drawer
  // actually needs: three cash payments is three times it was opened.
  it("counts tenders per method, not orders", () => {
    const r = rollupShiftPayments([p(100, "cash", "o1"), p(100, "cash", "o1")]);
    expect(r.byMethod[0]).toEqual({ method: "cash", amount: 200, count: 2 });
    expect(r.orderCount).toBe(1);
  });

  it("puts the biggest method at the top of the paper", () => {
    const r = rollupShiftPayments([
      p(100, "gcash", "o1"),
      p(900, "cash", "o2"),
      p(500, "card_terminal", "o3"),
    ]);
    expect(r.byMethod.map((m) => m.method)).toEqual(["cash", "card_terminal", "gcash"]);
  });

  it("hands back every order it saw, once each", () => {
    const r = rollupShiftPayments([p(1, "cash", "o1"), p(1, "cash", "o2"), p(1, "cash", "o1")]);
    expect([...r.orderIds].sort()).toEqual(["o1", "o2"]);
  });

  it("is zero for a shift that took nothing", () => {
    const r = rollupShiftPayments([]);
    expect(r).toEqual({ gross: 0, orderCount: 0, orderIds: [], byMethod: [] });
  });
});

describe("expectedCash", () => {
  it("counts the opening fund, what was taken, and what was removed", () => {
    // THE case the fund was added for: open with ₱1,000, take ₱3,000, pay out
    // ₱1,000 — there is ₱3,000 in the drawer. Without the fund the report said
    // ₱2,000 and the count never agreed.
    expect(expectedCash(100_000, 300_000, 100_000)).toBe(300_000);
  });

  it("is the fund itself before anything is sold", () => {
    expect(expectedCash(100_000, 0, 0)).toBe(100_000);
  });

  it("treats an uncounted fund as the old arithmetic, not as a guess", () => {
    // null = nobody was asked, which is every shift opened before this
    // existed. Those must keep reporting exactly what they reported before.
    expect(expectedCash(null, 300_000, 100_000)).toBe(200_000);
    expect(expectedCash(null, 0, 0)).toBe(0);
  });

  it("is zero when the till started empty and sold nothing", () => {
    expect(expectedCash(0, 0, 0)).toBe(0);
  });

  // A negative figure means the data is wrong somewhere. Printing one on a
  // report a cashier signs invites them to hand over money they never had.
  it("never prints a negative drawer", () => {
    expect(expectedCash(null, 50_000, 90_000)).toBe(0);
    expect(expectedCash(10_000, 50_000, 90_000)).toBe(0);
  });
});
