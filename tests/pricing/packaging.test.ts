import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computePackagingFee,
  packagedUnits,
  type PackagingConfig,
} from "@/lib/pricing/packaging";

/**
 * The packaging fee is a charge for containers. The bug this covers: it was
 * multiplied by every unit in the cart, so three bottled softdrinks on a
 * ₱10-per-item fee added ₱30 for three tubs that were never used.
 */

const cfg = (over: Partial<PackagingConfig> = {}): PackagingConfig => ({
  packagingFeeEnabled: true,
  packagingFee: 1_000, // ₱10
  packagingFeeScope: "all",
  packagingFeeMode: "item",
  ...over,
});

const silog = { itemId: "silog", quantity: 2 };
const coke = { itemId: "coke", quantity: 3 };
const drinks = new Set(["coke"]);

describe("packagedUnits", () => {
  it("counts every unit when nothing is exempt", () => {
    expect(packagedUnits([silog, coke])).toBe(5);
  });

  it("leaves out the items that come in their own container", () => {
    // THE test of this file: two silogs need tubs, three softdrinks don't.
    expect(packagedUnits([silog, coke], drinks)).toBe(2);
  });

  it("is zero for a drinks-only order", () => {
    expect(packagedUnits([coke], drinks)).toBe(0);
  });

  it("ignores a negative or nonsense quantity rather than crediting money back", () => {
    expect(packagedUnits([{ itemId: "x", quantity: -4 }])).toBe(0);
    expect(packagedUnits([{ itemId: "x", quantity: NaN }])).toBe(0);
  });
});

describe("computePackagingFee", () => {
  it("charges per packed unit, not per cart unit", () => {
    expect(computePackagingFee(cfg(), "delivery", packagedUnits([silog, coke], drinks))).toBe(2_000);
  });

  it("charges the flat fee once per order in order mode", () => {
    expect(computePackagingFee(cfg({ packagingFeeMode: "order" }), "delivery", 5)).toBe(1_000);
  });

  it("charges nothing at all when nothing in the order needs a container", () => {
    // Both modes. A flat "per order" fee on an order of three bottled drinks
    // is still a charge for packaging nobody used.
    expect(computePackagingFee(cfg(), "delivery", 0)).toBe(0);
    expect(computePackagingFee(cfg({ packagingFeeMode: "order" }), "delivery", 0)).toBe(0);
  });

  it("skips pickup when the fee is delivery-only", () => {
    expect(computePackagingFee(cfg({ packagingFeeScope: "delivery" }), "pickup", 4)).toBe(0);
    expect(computePackagingFee(cfg({ packagingFeeScope: "delivery" }), "delivery", 4)).toBe(4_000);
  });

  it("charges pickup too when the scope says both", () => {
    expect(computePackagingFee(cfg(), "pickup", 4)).toBe(4_000);
  });

  it("is nothing when switched off or set to zero", () => {
    expect(computePackagingFee(cfg({ packagingFeeEnabled: false }), "delivery", 4)).toBe(0);
    expect(computePackagingFee(cfg({ packagingFee: 0 }), "delivery", 4)).toBe(0);
  });

  it("charges an unmarked menu exactly what it charged before exemptions existed", () => {
    // No item is exempt → every unit counts, which is the old behaviour. A
    // database that hasn't run the migration returns an empty set, so this is
    // also what a lagging deploy does.
    const units = packagedUnits([silog, coke], new Set());
    expect(computePackagingFee(cfg(), "delivery", units)).toBe(5_000);
  });
});

/**
 * The quote and the charge come from one function.
 *
 * Checkout shows the customer a fee and the order path charges one. When each
 * carried its own copy of the arithmetic, fixing the count in the server left
 * the page quoting the old number — so the guard is that neither side
 * multiplies the fee itself.
 */
describe("one copy of the arithmetic", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("is used by the checkout page and by the order path", () => {
    for (const path of ["src/components/site/WebOrder.tsx", "src/server/orders/web-order.ts"]) {
      const src = read(path);
      expect(src, `${path} should price packaging through the shared helper`).toMatch(
        /from "@\/lib\/pricing\/packaging"/,
      );
      expect(src, `${path} should not multiply the packaging fee itself`).not.toMatch(
        /packagingFee\s*(\?\?\s*0\s*)?\)?\s*\*/,
      );
    }
  });
});
