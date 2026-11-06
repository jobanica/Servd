import { describe, it, expect } from "vitest";
import {
  addDays,
  agingBucket,
  agingSummary,
  agreementCovers,
  applyPayment,
  commissionFor,
  commissionableTotal,
  costPerHousehold,
  daysOverdue,
  decodeAttribution,
  encodeAttribution,
  isStatementLocked,
  magnetUrl,
  monthPeriod,
  ordersPer100,
  owesCommission,
  parseAttribution,
  parseRatePercent,
  payback,
  paymentMethodOf,
  previousMonth,
} from "@/lib/neighborhood/commission";

const TERRITORY = "3f6c2b1a-9d4e-4c2a-8b7f-1e2d3c4b5a69";

describe("the commission amount", () => {
  it("is 10% of the commissionable total, in centavos", () => {
    expect(commissionFor(25_000, 1000)).toBe(2_500); // ₱250 → ₱25
  });

  it("rounds half up, at write time", () => {
    expect(commissionFor(12_345, 1000)).toBe(1_235); // 1234.5 → 1235
    expect(commissionFor(12_344, 1000)).toBe(1_234);
    expect(commissionFor(1, 1250)).toBe(0); // 0.125
    expect(commissionFor(4, 1250)).toBe(1); // 0.5 → 1
  });

  it("rounds a negative adjustment half away from zero, symmetric with a positive one", () => {
    expect(commissionFor(-12_345, 1000)).toBe(-1_235);
  });

  it("parses a typed percentage into basis points", () => {
    expect(parseRatePercent("10")).toBe(1000);
    expect(parseRatePercent("12.5")).toBe(1250);
    expect(parseRatePercent("101")).toBeNull();
    expect(parseRatePercent("x")).toBeNull();
  });
});

describe("what's commissionable", () => {
  const lines = [
    { quantity: 2, unitPrice: 10_000, modifiers: [{ priceDeltaAtTime: 2_000 }] }, // 2 × ₱120
    { quantity: 1, unitPrice: 5_000 },
  ];

  it("is the goods: lines and their add-ons", () => {
    expect(commissionableTotal(lines, 0)).toBe(29_000);
  });

  it("less the discount the shop gave and any refunded line", () => {
    expect(commissionableTotal(lines, 4_000)).toBe(25_000);
    expect(commissionableTotal([{ quantity: 1, unitPrice: 5_000, refundedAmount: 5_000 }], 0)).toBe(0);
  });

  it("never goes below zero", () => {
    expect(commissionableTotal(lines, 99_999)).toBe(0);
  });

  it("is built from lines, so delivery, COD, packaging and ASAP fees and tips in the total never count", () => {
    // The order total isn't an input at all.
    expect(commissionableTotal.length).toBe(2);
  });
});

describe("who owes commission", () => {
  const agreement = { status: "active", startsOn: new Date("2026-11-01T00:00:00Z"), endsOn: null };
  const order = { source: "web", status: "closed", paymentStatus: "paid", createdAt: "2026-11-05T04:00:00Z" };
  const nb = { commercialTrack: "neighborhood" };

  it("a neighborhood partner, on a completed platform order inside an active agreement", () => {
    expect(owesCommission(nb, agreement, order)).toBe(true);
    expect(owesCommission(nb, agreement, { ...order, source: "qr" })).toBe(true);
  });

  it("never a standard account, whatever else is true", () => {
    expect(owesCommission({ commercialTrack: "standard" }, agreement, order)).toBe(false);
    expect(owesCommission({ commercialTrack: undefined }, agreement, order)).toBe(false);
  });

  it("never a walk-in or phone order rung up at the cashier", () => {
    expect(owesCommission(nb, agreement, { ...order, source: null })).toBe(false);
  });

  it("only once completed — not placed, cancelled or refunded", () => {
    expect(owesCommission(nb, agreement, { ...order, status: "preparing" })).toBe(false);
    expect(owesCommission(nb, agreement, { ...order, status: "cancelled" })).toBe(false);
    expect(owesCommission(nb, agreement, { ...order, paymentStatus: "refunded" })).toBe(false);
  });

  it("only with an active agreement covering the order's Manila date", () => {
    expect(owesCommission(nb, null, order)).toBe(false);
    expect(owesCommission(nb, { ...agreement, status: "pending" }, order)).toBe(false);
    // 31 Oct 23:30 Manila is before a 1 Nov start.
    expect(agreementCovers(agreement, "2026-10-31T15:30:00Z")).toBe(false);
    expect(agreementCovers(agreement, "2026-10-31T16:30:00Z")).toBe(true);
    const ended = { ...agreement, endsOn: new Date("2026-11-30T00:00:00Z") };
    expect(agreementCovers(ended, "2026-11-30T15:00:00Z")).toBe(true); // 30 Nov 11pm Manila
    expect(agreementCovers(ended, "2026-11-30T16:30:00Z")).toBe(false); // 1 Dec
  });

  it("records whether the money went online or straight to the shop", () => {
    expect(paymentMethodOf([{ gateway: "xendit", status: "paid" }])).toBe("online");
    expect(paymentMethodOf([{ gateway: "manual", status: "paid" }])).toBe("cod");
    expect(paymentMethodOf([])).toBe("cod");
  });
});

describe("statement periods, in Manila", () => {
  it("cover the whole calendar month", () => {
    const p = monthPeriod("2026-02")!;
    expect(p.periodStart).toBe("2026-02-01");
    expect(p.periodEnd).toBe("2026-02-28");
    expect(p.from.toISOString()).toBe("2026-01-31T16:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-02-28T16:00:00.000Z");
    expect(monthPeriod("2026-13")).toBeNull();
  });

  it("step back a month across the year", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
  });
});

describe("payments against a statement", () => {
  const issued = { status: "issued", commissionDue: 50_000, amountPaid: 0 };

  it("can be partial, then full", () => {
    expect(applyPayment(issued, 20_000)).toEqual({ ok: true, amountPaid: 20_000, status: "partially_paid" });
    expect(applyPayment({ ...issued, status: "partially_paid", amountPaid: 20_000 }, 30_000)).toEqual({
      ok: true,
      amountPaid: 50_000,
      status: "paid",
    });
  });

  it("only on an issued statement, never a draft or a closed one", () => {
    expect(applyPayment({ ...issued, status: "draft" }, 1_000).ok).toBe(false);
    expect(applyPayment({ ...issued, status: "paid" }, 1_000).ok).toBe(false);
    expect(applyPayment(issued, 0).ok).toBe(false);
  });

  it("an issued statement is locked", () => {
    expect(isStatementLocked("draft")).toBe(false);
    for (const s of ["issued", "partially_paid", "paid", "written_off"]) expect(isStatementLocked(s)).toBe(true);
  });
});

describe("the aging view", () => {
  it("buckets balances by days overdue", () => {
    const today = "2026-11-06";
    expect(daysOverdue("2026-11-10", today)).toBe(0);
    expect(agingBucket("2026-11-01", today)).toBe("1-30");
    expect(agingBucket("2026-08-01", today)).toBe("90+");
    expect(
      agingSummary(
        [
          { id: "a", balance: 10_000, dueAt: "2026-11-10" },
          { id: "b", balance: 20_000, dueAt: "2026-10-01" },
        ],
        today,
      ),
    ).toEqual({ current: 10_000, "1-30": 0, "31-60": 20_000, "61-90": 0, "90+": 0 });
  });
});

describe("campaigns and payback", () => {
  it("works out cost per household and orders per 100 magnets", () => {
    expect(costPerHousehold({ quantity: 500, unitCost: 1_500, householdsCovered: 480 })).toBe(1_563);
    expect(costPerHousehold({ quantity: 500, unitCost: null, householdsCovered: 480 })).toBeNull();
    expect(ordersPer100(37, 500)).toBe(7.4);
    expect(ordersPer100(3, 0)).toBeNull();
  });

  it("says when commission has covered the activation fee plus the magnets", () => {
    expect(payback(400_000, 1_000_000, 750_000)).toEqual({ target: 1_750_000, earned: 400_000, reached: false, remaining: 1_350_000 });
    expect(payback(1_800_000, 1_000_000, 750_000).reached).toBe(true);
  });
});

describe("attribution", () => {
  it("reads the magnet's parameters and ignores anything unknown", () => {
    expect(parseAttribution("magnet", TERRITORY)).toEqual({ sourceChannel: "magnet_qr", territoryId: TERRITORY });
    expect(parseAttribution("fb", "nope")).toEqual({ sourceChannel: "messenger", territoryId: null });
    expect(parseAttribution("evil", TERRITORY)).toBeNull();
  });

  it("round-trips through the cookie, encoded or not", () => {
    const a = { sourceChannel: "magnet_qr" as const, territoryId: TERRITORY };
    expect(decodeAttribution(encodeAttribution(a))).toEqual(a);
    expect(decodeAttribution(encodeURIComponent(encodeAttribution(a)))).toEqual(a);
    expect(decodeAttribution("hacker|x")).toBeNull();
  });

  it("builds the magnet's link from the partner's ordering page", () => {
    expect(magnetUrl("https://www.servdph.com/r/deca-eats-2", TERRITORY)).toBe(
      `https://www.servdph.com/r/deca-eats-2?src=magnet&t=${TERRITORY}`,
    );
  });
});
