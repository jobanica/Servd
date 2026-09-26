import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_OPENING_FLOAT_PESOS,
  floatLabel,
  validateOpeningFloat,
} from "@/lib/orders/opening-float";
import { formatPeso } from "@/lib/money";

/**
 * The revolving fund — the cash a cashier counts into the drawer when they
 * open their shift.
 *
 * It is the baseline every later count is checked against. Get it wrong at
 * opening and the variance at closing is wrong all day, and the cashier is the
 * one who has to explain the difference.
 */

describe("validateOpeningFloat", () => {
  it("accepts an ordinary opening fund", () => {
    expect(validateOpeningFloat("1000")).toBeNull();
    expect(validateOpeningFloat("1500.50")).toBeNull();
  });

  it("accepts zero — a till really can start empty", () => {
    expect(validateOpeningFloat("0")).toBeNull();
  });

  it("refuses to read a blank as zero", () => {
    // THE distinction this whole feature rests on: "there's nothing in the
    // drawer" and "I skipped the question" are different facts, and only one
    // of them can be checked against later.
    expect(validateOpeningFloat("")).toBeTruthy();
    expect(validateOpeningFloat("   ")).toBeTruthy();
  });

  it("refuses a negative fund", () => {
    expect(validateOpeningFloat("-100")).toBeTruthy();
  });

  it("refuses something that isn't a number", () => {
    expect(validateOpeningFloat("one thousand")).toBeTruthy();
  });

  it("catches the extra zero", () => {
    // ₱1,000,000 in a cash drawer is a typo every time, and it would sit in
    // the expected-cash figure until somebody was accused of losing it.
    expect(validateOpeningFloat(String(MAX_OPENING_FLOAT_PESOS + 1))).toBeTruthy();
    expect(validateOpeningFloat(String(MAX_OPENING_FLOAT_PESOS))).toBeNull();
  });
});

describe("floatLabel", () => {
  it("shows a counted fund as money", () => {
    expect(floatLabel(100_000, formatPeso)).toBe(formatPeso(100_000));
  });

  it("shows a counted zero as money, not as 'not counted'", () => {
    expect(floatLabel(0, formatPeso)).toBe(formatPeso(0));
  });

  it("says an uncounted fund was not counted, rather than claiming zero", () => {
    // Null means nobody was asked — a shift from before the till asked, or one
    // a payment opened by itself. Printing ₱0.00 there asserts the drawer
    // started empty, which is a claim, and usually the wrong one.
    expect(floatLabel(null, formatPeso)).toBe("not counted");
  });
});

/**
 * The till waits for a shift before it will take an order — that was the ask.
 * What must NOT happen is a server that refuses a sale: a till that can't ring
 * something up is worse than a sale attributed to the wrong shift.
 */
describe("the shift gate", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("is on the cashier screen: no open shift, no board", () => {
    const page = read("src/app/(platform)/cashier/page.tsx");
    expect(page).toContain("currentShift(");
    expect(page).toContain("OpenShiftScreen");
    // A shift left open past the cap belongs to someone who never signed out,
    // so the next cashier counts their own drawer in.
    expect(page).toContain("isShiftCurrent(");
  });

  it("never becomes a server refusing a sale", () => {
    // ensureShift is the safety net: a payment arriving without an open shift
    // still lands, against a shift opened for it with no fund counted.
    const session = read("src/server/orders/shift-session.ts");
    expect(session).toContain("export async function ensureShift");
    for (const f of ["src/server/orders/cashier.ts", "src/server/orders/cash-out.ts"]) {
      expect(read(f), `${f} must not refuse work for want of a shift`).not.toMatch(
        /throw new Error\(\s*["'`][^"'`]*shift/i,
      );
    }
  });

  it("reads and writes the fund in its own statement", () => {
    // The column ships as a hand-run migration. Asking for it alongside the
    // shift would make an un-migrated database answer "no shift" to every
    // lookup — which, now that the till waits for one, is a till that cannot
    // sell.
    const session = read("src/server/orders/shift-session.ts");
    expect(session).toMatch(/async function readFloat\(/);
    expect(session).toMatch(/catch \{\s*\n\s*return null; \/\/ column not migrated yet/);
    // The shift is created first and the fund written after, so a database
    // without the column still opens the shift.
    const open = /export async function openShift\(([\s\S]*?)\n\}/.exec(session)?.[1] ?? "";
    expect(open).toContain("ensureShift(");
    expect(open).toMatch(/updateMany\(\{ where: \{ id: shift\.id \}, data: \{ openingFloat/);
    expect(open).toMatch(/return shift; \/\/ column not migrated/);
  });
});
