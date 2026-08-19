import { describe, it, expect } from "vitest";
import { pickBranch, type Membership } from "@/lib/tenancy/active-branch";

/**
 * Which shop the dashboard is showing.
 *
 * Getting this wrong is not a cosmetic bug: it serves one branch's orders,
 * takings and customer data under another branch's name. So the requested
 * branch is honoured only when the login is genuinely a member of it — the
 * value arrives in a cookie, which means it comes from the browser and is a
 * request, never a fact.
 */

const m = (restaurantId: string, createdAt: string): Membership => ({ restaurantId, createdAt });

const A = m("branch-a", "2026-01-01T00:00:00.000Z");
const B = m("branch-b", "2026-06-01T00:00:00.000Z");
const C = m("branch-c", "2026-08-01T00:00:00.000Z");

describe("pickBranch", () => {
  it("honours a branch the login belongs to", () => {
    expect(pickBranch([A, B, C], "branch-b")).toBe("branch-b");
  });

  it("REFUSES a branch the login doesn't belong to", () => {
    // A forged cookie must not become access to somebody else's restaurant.
    expect(pickBranch([A, B], "someone-elses-restaurant")).toBe("branch-a");
  });

  it("defaults to the oldest membership — the shop they started with", () => {
    expect(pickBranch([C, A, B], null)).toBe("branch-a");
    expect(pickBranch([C, A, B], undefined)).toBe("branch-a");
    expect(pickBranch([C, A, B], "")).toBe("branch-a");
  });

  it("keeps the default stable when a branch is added", () => {
    // Adding a shop must not silently move an owner into a different one.
    const before = pickBranch([A, B], null);
    const after = pickBranch([A, B, C], null);
    expect(after).toBe(before);
  });

  it("breaks a same-timestamp tie deterministically", () => {
    // Two branches created in the same transaction would otherwise flip
    // between requests depending on row order.
    const x = m("zzz", "2026-01-01T00:00:00.000Z");
    const y = m("aaa", "2026-01-01T00:00:00.000Z");
    expect(pickBranch([x, y], null)).toBe("aaa");
    expect(pickBranch([y, x], null)).toBe("aaa");
  });

  it("is null when the login is staff nowhere", () => {
    expect(pickBranch([], "branch-a")).toBeNull();
  });

  it("leaves a single-branch account exactly as it was", () => {
    expect(pickBranch([A], null)).toBe("branch-a");
    expect(pickBranch([A], "branch-a")).toBe("branch-a");
    // Even a stale cookie from a branch they've been removed from.
    expect(pickBranch([A], "branch-b")).toBe("branch-a");
  });

  it("doesn't mutate the caller's list while sorting", () => {
    const list = [C, A, B];
    pickBranch(list, null);
    expect(list.map((x) => x.restaurantId)).toEqual(["branch-c", "branch-a", "branch-b"]);
  });
});
