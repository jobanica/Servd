import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_ACCESS_PLAN_ID } from "@/lib/billing/all-access";

/**
 * The daily billing run, exercised for real against a fake database, with a
 * grandfathered account and an All Access account side by side.
 *
 * The requirement was that existing accounts are not affected. This proves it
 * on the code path that actually moves money and access around: the old
 * account is handled exactly as before — an unconverted trial drops to Free —
 * while the new one is billed ₱800 and kept, not dropped.
 */

type Write = { op: string; args: unknown };
let writes: Write[];
let subs: unknown[];
let openInvoice: { id: string; periodStart: Date } | null;
let restaurantStatus: string;

const FREE_PLAN_ID = "00000000-0000-0000-0000-0000000000a1";
const BUSINESS_PLAN_ID = "00000000-0000-0000-0000-0000000000a3";

function fakeTx() {
  const rec = (op: string) => (args: unknown) => {
    writes.push({ op, args });
    return Promise.resolve({ id: "x" });
  };
  return {
    subscription: {
      findMany: () => Promise.resolve(subs),
      update: rec("subscription.update"),
    },
    plan: { findFirst: () => Promise.resolve({ id: FREE_PLAN_ID }) },
    restaurant: {
      update: rec("restaurant.update"),
      findUnique: () => Promise.resolve({ status: restaurantStatus }),
    },
    restaurantInvoice: {
      findFirst: () => Promise.resolve(openInvoice),
      create: rec("invoice.create"),
      update: rec("invoice.update"),
    },
  };
}

vi.mock("@/server/tenancy/scoped-db", () => ({
  systemDb: (fn: (tx: unknown) => unknown) => fn(fakeTx()),
}));
vi.mock("@/server/billing", () => ({ getBillingProvider: () => Promise.resolve(null) }));
vi.mock("@/server/billing/feature-subscriptions", () => ({
  renewFeatureSubscriptions: () => Promise.resolve({ renewed: 0, invoiced: 0, lapsed: 0 }),
}));

import { runBillingCron } from "@/server/billing/run-cron";

const NOW = new Date("2026-11-10T03:00:00.000Z");
const TRIAL_ENDED = new Date("2026-11-05T00:00:00.000Z");

const legacyTrial = {
  id: "sub-legacy",
  restaurantId: "r-legacy",
  planId: BUSINESS_PLAN_ID,
  status: "trialing",
  trialEndsAt: TRIAL_ENDED,
  currentPeriodEnd: TRIAL_ENDED,
  failedCharges: 0,
  cancelAtPeriodEnd: false,
  providerPaymentMethodId: null,
  providerCustomerId: null,
  plan: { id: BUSINESS_PLAN_ID, name: "Business", priceMonthly: 179_900 },
};

const allAccessTrial = {
  ...legacyTrial,
  id: "sub-new",
  restaurantId: "r-new",
  planId: ALL_ACCESS_PLAN_ID,
  plan: { id: ALL_ACCESS_PLAN_ID, name: "All Access", priceMonthly: 80_000 },
};

const forSub = (subId: string) =>
  writes.filter((w) => JSON.stringify(w.args).includes(subId));
const forRestaurant = (rid: string) =>
  writes.filter((w) => JSON.stringify(w.args).includes(rid));

beforeEach(() => {
  writes = [];
  openInvoice = null;
  restaurantStatus = "active";
});

describe("a grandfathered account whose trial ended unpaid", () => {
  it("drops to the Free plan, exactly as it always has", async () => {
    subs = [legacyTrial];
    await runBillingCron(NOW);
    const moved = forSub("sub-legacy").find((w) => w.op === "subscription.update");
    expect(moved, "the old account should be moved").toBeTruthy();
    expect(JSON.stringify(moved!.args)).toContain(FREE_PLAN_ID);
    expect(JSON.stringify(moved!.args)).toContain('"status":"active"');
  });

  it("is never billed ₱800 and never suspended by the new rules", async () => {
    subs = [legacyTrial];
    await runBillingCron(NOW);
    expect(writes.some((w) => w.op === "invoice.create")).toBe(false);
    expect(
      forRestaurant("r-legacy").some((w) => JSON.stringify(w.args).includes("suspended")),
    ).toBe(false);
  });
});

describe("an All Access account whose trial ended unpaid", () => {
  it("is billed ₱800, dated at the trial's end — not dropped to Free", async () => {
    subs = [allAccessTrial];
    await runBillingCron(NOW);
    const invoice = writes.find((w) => w.op === "invoice.create");
    expect(invoice, "an ₱800 bill should be raised").toBeTruthy();
    const data = (invoice!.args as { data: { amount: number; periodStart: Date } }).data;
    expect(data.amount).toBe(80_000);
    expect(new Date(data.periodStart)).toEqual(TRIAL_ENDED);
    // and NOT moved to the Free plan
    expect(JSON.stringify(writes)).not.toContain(FREE_PLAN_ID);
  });

  it("goes past due, keeping the account running through the grace", async () => {
    subs = [allAccessTrial];
    await runBillingCron(NOW);
    const s = forSub("sub-new").find((w) => w.op === "subscription.update");
    expect(JSON.stringify(s!.args)).toContain('"status":"past_due"');
    expect(JSON.stringify(writes)).not.toContain('"suspended"');
  });
});

describe("both at once", () => {
  it("handles each by its own rules in the same run", async () => {
    subs = [legacyTrial, allAccessTrial];
    await runBillingCron(NOW);
    // old → Free, new → ₱800 bill. Neither leaks into the other.
    expect(JSON.stringify(forSub("sub-legacy"))).toContain(FREE_PLAN_ID);
    const bills = writes.filter((w) => w.op === "invoice.create");
    expect(bills).toHaveLength(1);
    expect(JSON.stringify(bills[0].args)).toContain("r-new");
  });
});

describe("an All Access account a week past due", () => {
  it("is suspended", async () => {
    subs = [{ ...allAccessTrial, status: "past_due" }];
    openInvoice = { id: "inv-1", periodStart: TRIAL_ENDED }; // due 5 Nov
    await runBillingCron(new Date("2026-11-12T03:00:00.000Z")); // 7 days after due
    expect(
      writes.some(
        (w) => w.op === "restaurant.update" && JSON.stringify(w.args).includes("suspended"),
      ),
    ).toBe(true);
  });

  it("is not suspended a day early", async () => {
    subs = [{ ...allAccessTrial, status: "past_due" }];
    openInvoice = { id: "inv-1", periodStart: TRIAL_ENDED };
    await runBillingCron(new Date("2026-11-11T03:00:00.000Z")); // 6 days after due
    expect(JSON.stringify(writes)).not.toContain("suspended");
    // and no second bill for the same month
    expect(writes.some((w) => w.op === "invoice.create")).toBe(false);
  });
});
