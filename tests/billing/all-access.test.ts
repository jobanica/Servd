import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_ACCESS_FEATURES,
  ALL_ACCESS_GRACE_DAYS,
  ALL_ACCESS_PLAN_ID,
  ALL_ACCESS_PRICE,
  ALL_ACCESS_TRIAL_DAYS,
  isAllAccessPlan,
  nextAllAccessAction,
  suspendsAt,
  type AllAccessSnapshot,
} from "@/lib/billing/all-access";
import { ALL_FEATURES } from "@/lib/billing/features";
import { goLiveCopy, wentLiveLine } from "@/lib/billing/go-live-copy";

/**
 * The ₱800/month All Access plan: 30-day trial, then ₱800 a month for every
 * feature except the Content Calendar, 7 days to pay, then suspended.
 */

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-06T00:00:00.000Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

const snap = (over: Partial<AllAccessSnapshot> = {}): AllAccessSnapshot => ({
  status: "trialing",
  trialEndsAt: at(30),
  currentPeriodEnd: at(30),
  openInvoiceDueAt: null,
  suspended: false,
  cancelAtPeriodEnd: false,
  ...over,
});

describe("the plan", () => {
  it("is ₱800 a month with a 30-day trial and 7 days' grace", () => {
    expect(ALL_ACCESS_PRICE).toBe(80_000);
    expect(ALL_ACCESS_TRIAL_DAYS).toBe(30);
    expect(ALL_ACCESS_GRACE_DAYS).toBe(7);
  });

  it("includes every feature except the Content Calendar", () => {
    expect(ALL_ACCESS_FEATURES).not.toContain("contentScheduler");
    expect(ALL_ACCESS_FEATURES).toHaveLength(ALL_FEATURES.length - 1);
    for (const f of ALL_FEATURES) {
      if (f !== "contentScheduler") expect(ALL_ACCESS_FEATURES).toContain(f);
    }
  });

  it("is recognised by its id, never by its name", () => {
    expect(isAllAccessPlan(ALL_ACCESS_PLAN_ID)).toBe(true);
    expect(isAllAccessPlan("All Access")).toBe(false);
    expect(isAllAccessPlan(null)).toBe(false);
    expect(isAllAccessPlan(undefined)).toBe(false);
    // The seeded Free / Growth / Business ids are not it.
    for (const id of ["a1", "a2", "a3"]) {
      expect(isAllAccessPlan(`00000000-0000-0000-0000-0000000000${id}`)).toBe(false);
    }
  });
});

describe("the migration agrees with the code", () => {
  // The SQL creates the row the code looks up. If the two drift, new accounts
  // get a plan the code doesn't recognise, or features nobody intended.
  const sql = readFileSync(join(process.cwd(), "prisma/manual/add-all-access-plan.sql"), "utf8");
  const insert = sql.slice(sql.indexOf('INSERT INTO "plans"'), sql.indexOf("ON CONFLICT"));

  it("uses the same fixed id", () => {
    expect(insert).toContain(`'${ALL_ACCESS_PLAN_ID}'`);
  });

  it("uses the same price", () => {
    expect(insert).toMatch(new RegExp(`\\b${ALL_ACCESS_PRICE}\\b`));
  });

  it("writes exactly the same feature list", () => {
    const arr = /ARRAY\[([\s\S]*?)\]/.exec(insert)?.[1] ?? "";
    const sqlFeatures = [...arr.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]).sort();
    expect(sqlFeatures).toEqual([...ALL_ACCESS_FEATURES].sort());
  });
});

describe("nextAllAccessAction — the trial", () => {
  it("does nothing while the trial runs", () => {
    expect(nextAllAccessAction(snap(), at(29)).action).toBe("none");
  });

  it("raises the first bill the day the trial ends, dated at the trial's end", () => {
    const d = nextAllAccessAction(snap(), at(31));
    expect(d.action).toBe("invoice");
    if (d.action === "invoice") expect(d.dueAt).toEqual(at(30));
  });

  it("never turns an unpaid trial into a free account", () => {
    // The older plans dropped an unconverted trial to Free. On this one,
    // every account pays or is suspended — there is no free path.
    const d = nextAllAccessAction(snap(), at(60));
    expect(d.action).not.toBe("none");
  });
});

describe("nextAllAccessAction — a paid month", () => {
  const active = (over: Partial<AllAccessSnapshot> = {}) =>
    snap({ status: "active", trialEndsAt: null, currentPeriodEnd: at(60), ...over });

  it("does nothing until the month is up", () => {
    expect(nextAllAccessAction(active(), at(59)).action).toBe("none");
  });

  it("bills the next month when it falls due, dated at the period end", () => {
    const d = nextAllAccessAction(active(), at(60));
    expect(d.action).toBe("invoice");
    if (d.action === "invoice") expect(d.dueAt).toEqual(at(60));
  });

  it("ends a scheduled cancellation instead of billing", () => {
    expect(nextAllAccessAction(active({ cancelAtPeriodEnd: true }), at(60)).action).toBe("cancel");
  });
});

describe("nextAllAccessAction — unpaid", () => {
  const owing = (dueAt: Date, over: Partial<AllAccessSnapshot> = {}) =>
    snap({ status: "past_due", openInvoiceDueAt: dueAt, ...over });

  it("gives the full seven days", () => {
    for (const day of [0, 1, 6]) {
      expect(nextAllAccessAction(owing(at(30)), at(30 + day)).action).toBe("none");
    }
  });

  it("suspends on day seven", () => {
    expect(nextAllAccessAction(owing(at(30)), at(37)).action).toBe("suspend");
  });

  it("measures the grace from the due date, not from when the run noticed", () => {
    // A cron that missed three days must not hand out three extra days.
    expect(nextAllAccessAction(owing(at(30)), at(38)).action).toBe("suspend");
  });

  it("raises ONE bill per unpaid month — no daily duplicates", () => {
    // The older path opened a fresh invoice every day a no-card account was
    // past due. Here, an open invoice means nothing more to raise.
    for (const day of [1, 2, 3, 4, 5, 6]) {
      const d = nextAllAccessAction(owing(at(30)), at(30 + day));
      expect(d.action).not.toBe("invoice");
    }
  });

  it("raises the bill if somehow there's none, rather than suspend over nothing", () => {
    const d = nextAllAccessAction(snap({ status: "past_due", openInvoiceDueAt: null }), at(40));
    expect(d.action).toBe("invoice");
  });

  it("leaves an already-suspended account alone", () => {
    expect(nextAllAccessAction(owing(at(30), { suspended: true }), at(50)).action).toBe("none");
  });

  it("never acts on a cancelled subscription", () => {
    expect(nextAllAccessAction(snap({ status: "cancelled" }), at(100)).action).toBe("none");
  });

  it("tells the owner the exact date it suspends", () => {
    expect(suspendsAt(at(30))).toEqual(at(37));
  });
});

describe("what the self-build funnel promises", () => {
  it("says free for 30 days, then ₱800, when the trial is live", () => {
    const c = goLiveCopy("trial");
    expect(c.button).toContain("free for 30 days");
    expect(c.footnote).toContain("₱800");
    expect(`${c.perk} ${c.button} ${c.footnote}`).not.toMatch(/499|one payment|for life/i);
  });

  it("keeps the ₱499 wording exactly when it isn't — the button must match the checkout", () => {
    const c = goLiveCopy("activation");
    expect(c.button).toBe("Activate for ₱499");
    expect(`${c.perk} ${c.button} ${c.footnote}`).not.toMatch(/800|trial/i);
  });

  it("words the success page by what happened to that account", () => {
    // Someone who actually paid ₱499 is told it's theirs for life, whichever
    // model is current; a trial go-live is never told that.
    expect(wentLiveLine(true)).toMatch(/for life/);
    expect(wentLiveLine(false)).toMatch(/trial/);
    expect(wentLiveLine(false)).toContain("₱800");
    expect(wentLiveLine(false)).not.toMatch(/for life|one payment/);
  });
});
