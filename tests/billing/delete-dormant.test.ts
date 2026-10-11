import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDormant, lastActivityLabel, DORMANT_DAYS, MIN_ACCOUNT_AGE_DAYS } from "@/lib/billing/dormant";

/** Deleting dormant subscribers: permanent, so the guards are the feature. */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const now = new Date("2026-10-11T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("what counts as dormant", () => {
  it(`no order in ${DORMANT_DAYS}+ days`, () => {
    expect(isDormant({ createdAt: daysAgo(400), lastOrderAt: daysAgo(DORMANT_DAYS) }, now)).toBe(true);
    expect(isDormant({ createdAt: daysAgo(400), lastOrderAt: daysAgo(DORMANT_DAYS - 1) }, now)).toBe(false);
  });

  it("an old account that never took an order", () => {
    expect(isDormant({ createdAt: daysAgo(90), lastOrderAt: null }, now)).toBe(true);
  });

  it(`never a signup younger than ${MIN_ACCOUNT_AGE_DAYS} days — it's still setting up`, () => {
    expect(isDormant({ createdAt: daysAgo(5), lastOrderAt: null }, now)).toBe(false);
  });

  it("labels the activity for the confirm prompt", () => {
    expect(lastActivityLabel(null, now)).toBe("no orders ever");
    expect(lastActivityLabel(daysAgo(94), now)).toBe("last order 94 days ago");
  });
});

describe("the delete action", () => {
  const src = read("src/server/billing/delete-account.ts");

  it("is founder-only", () => {
    expect(src).toMatch(/await requireOwnerAction\(\)/);
  });

  it("re-checks dormancy on the server, whatever the page showed", () => {
    expect(src).toMatch(/if \(!isDormant\(\{ createdAt: r\.createdAt, lastOrderAt \}\)\)/);
  });

  it("needs the slug typed back exactly", () => {
    expect(src).toMatch(/if \(typed !== r\.slug\.toLowerCase\(\)\)/);
  });

  it("tells the agent portal in the same transaction as the delete", () => {
    expect(src).toMatch(/enqueueProductEvent\(tx, r\.id, "customer\.cancelled"[\s\S]*tx\.restaurant\.delete/);
  });

  it("keeps a login that still belongs to another branch", () => {
    expect(src).toMatch(/if \(elsewhere > 0\) continue;/);
  });

  it("leaves a record, since the restaurant's own audit log goes with it", () => {
    expect(src).toMatch(/console\.warn\(\s*`\[delete-account\]/);
  });
});

describe("the subscriptions page", () => {
  const page = read("src/app/(platform)/super-admin/subscriptions/page.tsx");

  it("only offers delete on dormant rows", () => {
    expect(page).toMatch(/\{dormant\(s\) && \(\s*<DeleteAccountButton/);
  });

  it("has a dormant filter", () => {
    expect(page).toMatch(/sp\.filter === "dormant"/);
  });
});
