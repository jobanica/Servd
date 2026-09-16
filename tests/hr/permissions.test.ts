import { describe, it, expect } from "vitest";
import {
  canAccessPayroll,
  canAddEmployees,
  canEditPay,
  canSeePay,
  type HrRole,
} from "@/lib/hr/permissions";

/**
 * What a manager must not learn is what their colleagues earn. The tests that
 * matter are the refusals, and the one separating "may look at" from "may
 * change".
 */

describe("canSeePay", () => {
  it("shows the owner everyone's rate", () => {
    expect(canSeePay("admin", false)).toBe(true);
    expect(canSeePay("admin", true)).toBe(true);
  });

  it("hides a colleague's rate from a manager", () => {
    expect(canSeePay("manager", false)).toBe(false);
  });

  it("still lets a manager see their own", () => {
    // Everyone is entitled to know what they earn; hiding a manager's own rate
    // from them would be odd rather than careful.
    expect(canSeePay("manager", true)).toBe(true);
  });
});

describe("canEditPay", () => {
  it("is the owner's alone", () => {
    expect(canEditPay("admin")).toBe(true);
    expect(canEditPay("manager")).toBe(false);
  });

  it("is not the same question as canSeePay", () => {
    // The trap: a manager may READ their own rate. Deciding edits with that
    // same test would let them give themselves a raise.
    expect(canSeePay("manager", true)).toBe(true);
    expect(canEditPay("manager")).toBe(false);
  });
});

describe("canAddEmployees", () => {
  it("is the owner's alone", () => {
    expect(canAddEmployees("admin")).toBe(true);
    expect(canAddEmployees("manager")).toBe(false);
  });
});

describe("canAccessPayroll", () => {
  it("is the owner's alone", () => {
    expect(canAccessPayroll("admin")).toBe(true);
    expect(canAccessPayroll("manager")).toBe(false);
  });
});

describe("the manager's HR permissions as a whole", () => {
  it("grants nothing about money", () => {
    const role: HrRole = "manager";
    expect(canAccessPayroll(role)).toBe(false);
    expect(canEditPay(role)).toBe(false);
    expect(canAddEmployees(role)).toBe(false);
    expect(canSeePay(role, false)).toBe(false);
  });
});
