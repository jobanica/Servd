import { describe, it, expect } from "vitest";
import {
  isFullyRepaid,
  nextDeduction,
  outstanding,
  percentRepaid,
  periodsRemaining,
  validateAdvance,
  type Advance,
} from "@/lib/hr/cash-advance";

/**
 * This decides how much comes out of someone's wages. The test that matters
 * most is the last instalment: taking the full ₱500 off a ₱200 balance is
 * over-collecting from a person's pay, and nothing downstream would catch it.
 */

const advance = (over: Partial<Advance> = {}): Advance => ({
  principal: 500_000, // ₱5,000
  perPeriod: 50_000, //  ₱500
  status: "active",
  ...over,
});

describe("outstanding", () => {
  it("is what is left", () => {
    expect(outstanding(500_000, 150_000)).toBe(350_000);
  });

  it("never goes negative, even if over-collected already", () => {
    // A correction or a hand-entered deduction could push repaid past the
    // principal. The staff member does not then owe negative money.
    expect(outstanding(500_000, 600_000)).toBe(0);
  });

  it("survives nonsense rather than returning NaN into a wage calculation", () => {
    expect(outstanding(NaN, 100)).toBe(0);
    expect(outstanding(100, NaN)).toBe(0);
  });
});

describe("nextDeduction", () => {
  it("takes the instalment while there is plenty left", () => {
    expect(nextDeduction(advance(), 0)).toBe(50_000);
    expect(nextDeduction(advance(), 100_000)).toBe(50_000);
  });

  it("takes only what is left on the final cutoff", () => {
    // ₱200 left, ₱500 instalment — take ₱200. THE test of this file.
    expect(nextDeduction(advance(), 480_000)).toBe(20_000);
  });

  it("takes nothing once it is paid off", () => {
    expect(nextDeduction(advance(), 500_000)).toBe(0);
  });

  it("takes nothing while paused", () => {
    // The whole point of pausing: a bad fortnight and the owner skips it,
    // without having to remember not to deduct.
    expect(nextDeduction(advance({ status: "paused" }), 0)).toBe(0);
  });

  it("takes nothing once cancelled or settled", () => {
    expect(nextDeduction(advance({ status: "cancelled" }), 0)).toBe(0);
    expect(nextDeduction(advance({ status: "settled" }), 0)).toBe(0);
  });

  it("takes nothing when the instalment is zero", () => {
    expect(nextDeduction(advance({ perPeriod: 0 }), 0)).toBe(0);
  });
});

describe("periodsRemaining", () => {
  it("counts the paydays left, final short one included", () => {
    expect(periodsRemaining(advance(), 0)).toBe(10);
    // ₱4,800 repaid leaves ₱200 — one more payday, not zero.
    expect(periodsRemaining(advance(), 480_000)).toBe(1);
  });

  it("is zero when settled", () => {
    expect(periodsRemaining(advance(), 500_000)).toBe(0);
  });

  it("is unknown rather than Infinity when nothing is being taken", () => {
    expect(periodsRemaining(advance({ perPeriod: 0 }), 0)).toBeNull();
  });
});

describe("isFullyRepaid / percentRepaid", () => {
  it("closes exactly on the last peso", () => {
    expect(isFullyRepaid(500_000, 499_900)).toBe(false);
    expect(isFullyRepaid(500_000, 500_000)).toBe(true);
  });

  it("reports progress for the bar", () => {
    expect(percentRepaid(500_000, 0)).toBe(0);
    expect(percentRepaid(500_000, 250_000)).toBe(50);
    expect(percentRepaid(500_000, 500_000)).toBe(100);
  });

  it("caps at 100 rather than showing 120%", () => {
    expect(percentRepaid(500_000, 600_000)).toBe(100);
  });
});

describe("validateAdvance", () => {
  it("accepts a normal advance", () => {
    expect(validateAdvance(5000, 500)).toBeNull();
  });

  it("rejects missing or negative amounts", () => {
    expect(validateAdvance(0, 500)).toBeTruthy();
    expect(validateAdvance(5000, 0)).toBeTruthy();
    expect(validateAdvance(-100, 500)).toBeTruthy();
  });

  it("rejects an instalment larger than the loan", () => {
    // Almost always a typo. The cap would otherwise hide it by quietly turning
    // the advance into a single full deduction.
    expect(validateAdvance(5000, 6000)).toBeTruthy();
  });

  it("allows repaying it in one go", () => {
    expect(validateAdvance(5000, 5000)).toBeNull();
  });
});
