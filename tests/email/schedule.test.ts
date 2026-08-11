import { describe, it, expect } from "vitest";
import { daysSince, isStepDue, dueRange, CATCH_UP_DAYS } from "@/lib/email/schedule";

// 2026-08-11 12:00 Manila (= 04:00 UTC).
const NOW = new Date("2026-08-11T04:00:00Z");

describe("daysSince", () => {
  it("is 0 on the day the preview was created", () => {
    expect(daysSince("2026-08-11T02:00:00Z", NOW)).toBe(0);
  });

  it("counts whole calendar days", () => {
    expect(daysSince("2026-08-08T04:00:00Z", NOW)).toBe(3);
  });

  // Calendar days in MANILA, not 24-hour blocks. A preview created at 11 PM
  // Manila is "1 day old" the next morning — which is what "day 1" means to
  // whoever set the schedule.
  it("treats late-evening Manila as the previous day", () => {
    const elevenPmYesterday = new Date("2026-08-10T15:00:00Z"); // 23:00 +08 on the 10th
    expect(daysSince(elevenPmYesterday, NOW)).toBe(1);
  });

  // The server runs in UTC: 1 AM Manila is still the previous UTC day. Getting
  // this wrong would fire every follow-up a day early for overnight builders.
  it("treats early-morning Manila as today", () => {
    const onePmToday = new Date("2026-08-10T17:00:00Z"); // 01:00 +08 on the 11th
    expect(daysSince(onePmToday, NOW)).toBe(0);
  });
});

describe("isStepDue", () => {
  const created = "2026-08-08T04:00:00Z"; // 3 days before NOW

  it("is due on its day", () => {
    expect(isStepDue(3, created, NOW)).toBe(true);
  });

  it("is not due before its day", () => {
    expect(isStepDue(4, created, NOW)).toBe(false);
    expect(isStepDue(10, created, NOW)).toBe(false);
  });

  // A missed cron night must not skip anyone permanently.
  it("still fires within the catch-up window", () => {
    expect(isStepDue(2, created, NOW)).toBe(true); // one night late
    expect(isStepDue(1, created, NOW)).toBe(true); // two nights late
  });

  // …but the window has to close, or adding a step next year would blast every
  // lead who has ever passed that day.
  it("stops firing once the catch-up window has closed", () => {
    expect(isStepDue(0, created, NOW)).toBe(false); // 3 days late — past the window
    expect(CATCH_UP_DAYS).toBe(3);
  });
});

describe("dueRange", () => {
  it("matches isStepDue for the same instant", () => {
    for (const dayOffset of [0, 1, 3, 7, 14]) {
      const { from, to } = dueRange(dayOffset, NOW);
      for (const daysAgo of [0, 1, 2, 3, 4, 7, 8, 14, 15, 20]) {
        const created = new Date(NOW.getTime() - daysAgo * 86_400_000);
        const inRange = created >= from && created < to;
        expect(inRange).toBe(isStepDue(dayOffset, created, NOW));
      }
    }
  });

  it("spans exactly the catch-up window", () => {
    const { from, to } = dueRange(5, NOW);
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(CATCH_UP_DAYS);
  });
});
