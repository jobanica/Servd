import { describe, it, expect } from "vitest";
import {
  computeEarnings,
  bonusesFor,
  formatPHP,
  PARTNER_PROGRAM,
} from "@/lib/partners/program";

describe("bonusesFor — stacked milestone bonuses", () => {
  it("unlocks nothing below the first tier", () => {
    expect(bonusesFor(9).total).toBe(0);
    expect(bonusesFor(9).reached).toHaveLength(0);
  });
  it("stacks every tier reached", () => {
    expect(bonusesFor(10).total).toBe(2_000);
    expect(bonusesFor(25).total).toBe(2_000 + 5_000);
    expect(bonusesFor(50).total).toBe(2_000 + 5_000 + 15_000);
    expect(bonusesFor(100).total).toBe(2_000 + 5_000 + 15_000 + 40_000);
    expect(bonusesFor(250).total).toBe(2_000 + 5_000 + 15_000 + 40_000 + 100_000);
  });
});

describe("computeEarnings", () => {
  it("matches the documented formulas (10 restaurants @ ₱1,500)", () => {
    const e = computeEarnings({ restaurants: 10, monthlyPricePesos: 1500 });
    // 10 × 1500 × 12 × 30%
    expect(e.yearOneCommission).toBe(54_000);
    // 10 active → ₱2,000 bonus
    expect(e.bonusesUnlocked).toBe(2_000);
    expect(e.firstYearTotal).toBe(56_000);
    // 10 × 1500 × 12 × 10%
    expect(e.ongoingPerYear).toBe(18_000);
  });

  it("scales and stacks bonuses (50 restaurants @ ₱2,000)", () => {
    const e = computeEarnings({ restaurants: 50, monthlyPricePesos: 2000 });
    expect(e.yearOneCommission).toBe(50 * 2000 * 12 * 0.3); // 360,000
    expect(e.bonusesUnlocked).toBe(2_000 + 5_000 + 15_000); // 22,000
    expect(e.firstYearTotal).toBe(360_000 + 22_000);
    expect(e.ongoingPerYear).toBe(50 * 2000 * 12 * 0.1); // 120,000
  });

  it("guards against negative / fractional inputs", () => {
    const e = computeEarnings({ restaurants: -5, monthlyPricePesos: -100 });
    expect(e.yearOneCommission).toBe(0);
    expect(e.firstYearTotal).toBe(0);
  });

  it("respects an overridden program config", () => {
    const e = computeEarnings(
      { restaurants: 1, monthlyPricePesos: 1000 },
      { ...PARTNER_PROGRAM, firstYearPct: 50, firstYearMonths: 12 },
    );
    expect(e.yearOneCommission).toBe(1 * 1000 * 12 * 0.5);
  });
});

describe("formatPHP", () => {
  it("adds a peso sign and thousands separators", () => {
    expect(formatPHP(54000)).toBe("₱54,000");
    expect(formatPHP(1234567)).toBe("₱1,234,567");
    expect(formatPHP(0)).toBe("₱0");
  });
  it("rounds to whole pesos", () => {
    expect(formatPHP(1999.6)).toBe("₱2,000");
  });
});

import { withholdingAmount, netPayout } from "@/lib/partners/statement";

describe("payout statement — withholding (configurable, not tax advice)", () => {
  it("computes withholding at a percentage of gross (centavos)", () => {
    expect(withholdingAmount(100000, 0)).toBe(0);
    expect(withholdingAmount(100000, 10)).toBe(10000);
    expect(withholdingAmount(199900, 5)).toBe(9995);
  });
  it("net = gross − withholding, never negative", () => {
    expect(netPayout(100000, 10)).toBe(90000);
    expect(netPayout(100000, 0)).toBe(100000);
  });
  it("clamps the percentage to 0..100", () => {
    expect(withholdingAmount(100000, -5)).toBe(0);
    expect(withholdingAmount(100000, 150)).toBe(100000);
  });
});

import { toEmbed } from "@/lib/partners/video";

describe("training video — URL normalization", () => {
  it("embeds YouTube watch / youtu.be / shorts links", () => {
    expect(toEmbed("https://www.youtube.com/watch?v=abc123DEF45")).toEqual({
      kind: "youtube",
      src: "https://www.youtube.com/embed/abc123DEF45",
    });
    expect(toEmbed("https://youtu.be/abc123DEF45")?.src).toBe("https://www.youtube.com/embed/abc123DEF45");
    expect(toEmbed("https://youtube.com/shorts/abc123DEF45")?.kind).toBe("youtube");
  });
  it("embeds Vimeo", () => {
    expect(toEmbed("https://vimeo.com/123456789")).toEqual({
      kind: "vimeo",
      src: "https://player.vimeo.com/video/123456789",
    });
  });
  it("treats a direct video file as a file", () => {
    expect(toEmbed("https://cdn.example.com/training.mp4")?.kind).toBe("file");
  });
  it("falls back to a plain link, and null for empty", () => {
    expect(toEmbed("https://example.com/watch")?.kind).toBe("link");
    expect(toEmbed("")).toBeNull();
    expect(toEmbed(null)).toBeNull();
  });
});
