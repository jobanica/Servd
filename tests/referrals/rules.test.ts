import { describe, it, expect } from "vitest";
import {
  normalizeCode,
  generateCode,
  validateAttribution,
  isWithinClawbackWindow,
  track1CreditAmount,
  shouldAccrueFirstReward,
  creditCoversCycle,
  commissionForInvoice,
  periodKey,
  type CommissionInput,
} from "@/lib/referrals/rules";

describe("referral rules — code helpers", () => {
  it("normalizes codes to uppercase alphanumerics", () => {
    expect(normalizeCode(" ab-cd_12 ")).toBe("ABCD12");
    expect(normalizeCode("")).toBe("");
  });

  it("generates codes without ambiguous characters", () => {
    let seed = 0.123;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const code = generateCode(rand, 8);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/); // no I, O, 0, 1
  });
});

describe("referral rules — self-referral guard (fraud)", () => {
  const base = {
    codeOwnerRestaurantId: "rest-A",
    codeActive: true,
    newRestaurantId: "rest-B",
    newOwnerEmail: "owner-b@example.com",
    referrerEmails: ["owner-a@example.com"],
  };

  it("accepts a legitimate distinct referral", () => {
    expect(validateAttribution(base)).toEqual({ ok: true });
  });

  it("blocks a code referring its own restaurant", () => {
    expect(validateAttribution({ ...base, newRestaurantId: "rest-A" })).toEqual({
      ok: false,
      reason: "self_restaurant",
    });
  });

  it("blocks self-referral by matching owner email (case/space-insensitive)", () => {
    expect(
      validateAttribution({ ...base, newOwnerEmail: "  OWNER-A@example.com " }),
    ).toEqual({ ok: false, reason: "self_email" });
  });

  it("blocks an inactive code", () => {
    expect(validateAttribution({ ...base, codeActive: false })).toEqual({
      ok: false,
      reason: "inactive",
    });
  });

  it("does not falsely flag when emails differ", () => {
    expect(
      validateAttribution({ ...base, referrerEmails: ["a@x.com", "b@x.com"] }),
    ).toEqual({ ok: true });
  });
});

describe("referral rules — accrual & idempotency", () => {
  it("rewards only the first paid month, once (idempotent on retries)", () => {
    expect(shouldAccrueFirstReward({ status: "paying", firstPaidAt: null })).toBe(true);
    // Already accrued → never again (guards webhook retries / double-pay).
    expect(shouldAccrueFirstReward({ status: "paying", firstPaidAt: new Date() })).toBe(false);
  });

  it("never accrues for a churned referral", () => {
    expect(shouldAccrueFirstReward({ status: "churned", firstPaidAt: null })).toBe(false);
  });

  it("computes the Track-1 credit as N months of the plan price", () => {
    expect(track1CreditAmount(199900, 1)).toBe(199900);
    expect(track1CreditAmount(199900, 2)).toBe(399800);
    expect(track1CreditAmount(199900, 0)).toBe(0);
  });

  it("a full-month credit covers a billing cycle", () => {
    expect(creditCoversCycle(199900, 199900)).toBe(true);
    expect(creditCoversCycle(199900, 299900)).toBe(false);
    expect(creditCoversCycle(199900, 0)).toBe(false); // nothing due
  });
});

describe("referral rules — clawback window", () => {
  const firstPaid = new Date("2026-01-01T00:00:00Z");

  it("is inside the window within N days", () => {
    expect(isWithinClawbackWindow(firstPaid, new Date("2026-02-15T00:00:00Z"), 60)).toBe(true);
  });

  it("is outside the window after N days", () => {
    expect(isWithinClawbackWindow(firstPaid, new Date("2026-04-01T00:00:00Z"), 60)).toBe(false);
  });

  it("is never inside the window when never paid", () => {
    expect(isWithinClawbackWindow(null, new Date(), 60)).toBe(false);
  });
});

describe("referral rules — Track 2 commissions", () => {
  const base: CommissionInput = {
    payoutModel: "recurring",
    tier: "affiliate",
    paidMonthCount: 1,
    invoiceAmount: 199900,
    affiliatePct: 25,
    resellerPct: 35,
    durationMonths: 12,
    bountyAmount: 50000,
    bountyAlreadyGranted: false,
  };

  it("recurring: affiliate earns 25% each month within the window", () => {
    expect(commissionForInvoice(base)).toBe(49975); // 25% of 199900
    expect(commissionForInvoice({ ...base, paidMonthCount: 12 })).toBe(49975);
  });

  it("recurring: reseller earns 35%", () => {
    expect(commissionForInvoice({ ...base, tier: "reseller" })).toBe(69965);
  });

  it("recurring: nothing after the duration window", () => {
    expect(commissionForInvoice({ ...base, paidMonthCount: 13 })).toBeNull();
  });

  it("bounty: paid once after the 2nd paid month, never again", () => {
    const b = { ...base, payoutModel: "bounty" as const };
    expect(commissionForInvoice({ ...b, paidMonthCount: 1 })).toBeNull(); // too early
    expect(commissionForInvoice({ ...b, paidMonthCount: 2 })).toBe(50000);
    expect(commissionForInvoice({ ...b, paidMonthCount: 2, bountyAlreadyGranted: true })).toBeNull();
  });

  it("buckets dates into YYYY-MM periods", () => {
    expect(periodKey(new Date("2026-06-19T10:00:00Z"))).toBe("2026-06");
    expect(periodKey(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
  });
});
