import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Existing accounts are grandfathered: the ₱800 All Access plan is for new
 * accounts only, and nothing about it may move, re-price, re-gate or re-bill
 * an account that already existed.
 *
 * The behaviour is proved in cron-grandfathering.test.ts. These pin the
 * structure that makes it true everywhere else, so a later edit can't quietly
 * route an old account through the new rules.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the migration", () => {
  const sql = read("prisma/manual/add-all-access-plan.sql");
  // Strip comments so prose about UPDATEs doesn't count as one.
  const code = sql.replace(/--.*$/gm, "");

  it("only ever ADDS a plan — it can't re-price or re-gate an existing one", () => {
    expect(code).toMatch(/INSERT INTO "plans"/);
    expect(code).toMatch(/ON CONFLICT \("id"\) DO NOTHING/);
    expect(code).not.toMatch(/UPDATE\s+"plans"/i);
    expect(code).not.toMatch(/DELETE\s+FROM\s+"plans"/i);
  });

  it("never touches a subscription or a restaurant", () => {
    // Moving an account between plans is what grandfathering forbids.
    expect(code).not.toMatch(/UPDATE\s+"subscriptions"/i);
    expect(code).not.toMatch(/UPDATE\s+"restaurants"/i);
    expect(code).not.toMatch(/DELETE\s+FROM/i);
  });

  it("changes only the three acquisition emails that quote ₱499", () => {
    const updated = [...code.matchAll(/WHERE "stepKey" = '([A-Za-z_0-9]+)'/g)].map((m) => m[1]);
    expect(updated.sort()).toEqual(["B_day3", "B_day7", "B_immediate"]);
    const updates = code.match(/UPDATE\s+"(\w+)"/gi) ?? [];
    for (const u of updates) expect(u).toMatch(/email_templates/);
  });
});

describe("who gets the new plan", () => {
  it("only the paths that create or first take an account live", () => {
    // provisionTrial is where an account is put on All Access. An existing
    // account never passes through any of these again.
    const callers = [
      "src/app/(platform)/signup/actions.ts",
      "src/server/billing/super-admin-actions.ts",
      "src/server/build/activation.ts",
    ];
    for (const f of callers) expect(read(f)).toContain("provisionTrial(");
  });

  it("not a partner's restaurant — the programme promises Servd never bills those", () => {
    const convert = read("src/server/storefront-demo/convert.ts");
    // All Access is looked up only for the Servd team's own conversions.
    expect(convert).toMatch(/billing === "trial30" \? await getAllAccessPlan\(tx\) : null/);
    expect(read("src/server/partners/demo.ts")).toMatch(/convertDemo\([^;]*?, "free"\)/);
  });

  it("honours a ₱499 that was actually paid with exactly what it bought", () => {
    // A ₱499 invoice raised before the change and paid after it: they paid for
    // online ordering for good, and that is what they get.
    const act = read("src/server/build/activation.ts");
    expect(act).toMatch(/if \(request\.amount > 0\) \{[\s\S]*?provisionFreePlan/);
  });

  it("keeps the old ₱499 paywall until the plan row actually exists", () => {
    // Going free before All Access exists would hand out lifetime-free
    // accounts — the trial would fall back to the Free plan.
    expect(read("src/server/build/activate-action.ts")).toMatch(
      /if \(await allAccessLive\(\)\)[\s\S]*?createActivationCheckout/,
    );
  });
});

describe("everything else stays exactly as it was for old accounts", () => {
  it("the billing cron reaches the old logic for every plan but All Access", () => {
    const cron = read("src/server/billing/run-cron.ts");
    const branch = cron.indexOf("if (isAllAccessPlan(sub.planId))");
    const legacy = cron.indexOf("const decision = nextBillingAction(");
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(legacy);
    // and the branch ends the iteration, so the old logic never sees it
    expect(cron.slice(branch, legacy)).toMatch(/await billAllAccess\(sub, now, s\);\s*continue;/);
    // the old trial → Free downgrade is still there for everyone else
    expect(cron).toContain("planId: freePlan.id");
  });

  it("the feature gate only spares an All Access trial from the Free drop", () => {
    const gate = read("src/server/billing/feature-gate.ts");
    expect(gate).toMatch(/const lapsed = isTrialing && !onTrial && !isAllAccessPlan\(sub\?\.planId\);/);
  });

  it("the billing page shows the old page unless the account is on All Access", () => {
    const page = read("src/app/(platform)/admin/billing/page.tsx");
    expect(page).toMatch(/if \(sub && isAllAccessPlan\(sub\.planId\)\) \{[\s\S]*?return \(\s*<AllAccessBilling/);
    // the one-time store is still there for everyone else
    expect(page).toContain("<FeatureStore rows={rows} />");
  });

  it("one-time unlocks are refused only on All Access", () => {
    const actions = read("src/server/billing/addon-actions.ts");
    expect(actions).toMatch(/if \(isAllAccessPlan\(sub\?\.planId\)\) \{\s*return \{ error: "This is already included/);
  });

  it("tables open during a trial only on All Access", () => {
    const addons = read("src/server/billing/addons.ts");
    expect(addons).toMatch(/\(!access\.onTrial \|\| access\.allAccess\) && access\.features\.has\("unlimitedTables"\)/);
  });

  it("no existing plan's price was changed in the seed", () => {
    const seed = read("prisma/seed.mjs");
    expect(seed).toContain("priceMonthly: 0,");
    expect(seed).toContain("priceMonthly: 89900,");
    expect(seed).toContain("priceMonthly: 179900,");
  });
});

describe("the terms keep the grandfathered promise", () => {
  it("states both sets of terms, split by when an account went live", () => {
    const terms = read("src/app/terms/page.tsx");
    expect(terms).toContain("₱800 a month");
    expect(terms).toMatch(/went live before 6 October 2026 keep the terms they joined on/);
    expect(terms).toContain("₱499, once");
  });
});

describe("retiring Growth and Business", () => {
  const sql = read("prisma/manual/retire-growth-business.sql").replace(/--.*$/gm, "");

  it("retires them — it never deletes a plan or moves an account", () => {
    expect(sql).toMatch(/UPDATE "plans"\s+SET "isActive" = false/);
    expect(sql).not.toMatch(/DELETE/i);
    expect(sql).not.toMatch(/UPDATE\s+"subscriptions"/i);
    expect(sql).not.toMatch(/UPDATE\s+"restaurants"/i);
  });

  it("touches exactly Growth and Business, and never FREE or All Access", () => {
    const ids = [...sql.matchAll(/'(0{8}-0{4}-0{4}-0{4}-0{10}a\d)'/g)].map((m) => m[1]).sort();
    expect(ids).toEqual([
      "00000000-0000-0000-0000-0000000000a2",
      "00000000-0000-0000-0000-0000000000a3",
    ]);
  });

  it("keeps a retired plan visible on the accounts still on it", () => {
    // Otherwise the picker shows the first active plan instead, and pressing
    // Assign downgrades a grandfathered customer without anyone meaning to.
    const page = read("src/app/(platform)/super-admin/subscriptions/page.tsx");
    expect(page).toMatch(/plans\.find\(\(p\) => p\.id === s\.planId && !p\.isActive\)/);
    expect(page).toContain("(retired — current plan)");
  });

  it("no longer offers Growth to anyone", () => {
    // What renders, not what the comments explain.
    const shown = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(shown("src/app/(platform)/admin/domains/page.tsx")).not.toMatch(/included in Growth|Growth plan/);
    expect(shown("src/app/(platform)/merchant/page.tsx")).not.toMatch(/Growth plan/);
  });
});
