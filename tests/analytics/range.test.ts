import { describe, it, expect } from "vitest";
import { parseRange, rangeToDates } from "@/lib/analytics/range";

describe("parseRange", () => {
  it("accepts supported ranges, defaults to 30", () => {
    expect(parseRange("7")).toBe("7");
    expect(parseRange("90")).toBe("90");
    expect(parseRange("30")).toBe("30");
    expect(parseRange("999")).toBe("30");
    expect(parseRange(undefined)).toBe("30");
  });
});

describe("rangeToDates", () => {
  it("returns a window of the right length", () => {
    const now = new Date("2026-06-30T00:00:00Z");
    const { from, to } = rangeToDates("7", now);
    expect(to).toEqual(now);
    expect(from).toEqual(new Date("2026-06-23T00:00:00Z"));
  });
});
