import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_META } from "@/lib/billing/features";
import { normalizeFeaturePrices, DEFAULT_FEATURE_PRICES } from "@/lib/billing/feature-pricing";

/** Offline mode is no longer sold. Shops that have it keep it. */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("offline mode is retired from sale", () => {
  it("is marked retired", () => {
    expect(FEATURE_META.find((f) => f.key === "offline")?.retired).toBe(true);
  });

  it("is never priced for sale — not by default, not by an older saved price list", () => {
    expect(DEFAULT_FEATURE_PRICES.offline.enabled).toBe(false);
    expect(normalizeFeaturePrices({ offline: { price: 150000, enabled: true } }).offline.enabled).toBe(false);
  });

  it("leaves every other feature's saved price alone", () => {
    expect(normalizeFeaturePrices({ inventory: { price: 90000, enabled: true } }).inventory).toEqual({
      price: 90000,
      enabled: true,
    });
  });

  it("is hidden from the Billing store unless the shop already owns it", () => {
    expect(read("src/app/(platform)/admin/billing/page.tsx")).toMatch(
      /\.filter\(\(f\) => !f\.retired \|\| owned\.has\(f\.key as Feature\)\)/,
    );
  });

  it("still works for shops that have it — the gate reads plan + purchases, not the retired flag", () => {
    const gate = read("src/server/billing/feature-gate.ts");
    expect(gate).not.toMatch(/retired/);
    expect(read("src/app/(platform)/kitchen/page.tsx")).toMatch(/hasFeature\(user\.restaurantId, "offline"\)/);
  });

  it("isn't advertised on the home page", () => {
    expect(read("src/app/page.tsx")).not.toMatch(/offline\s+mode/i);
  });
});
