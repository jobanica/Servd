import { describe, it, expect } from "vitest";
import {
  DEFAULT_DELIVERY_WINDOWS,
  batchLabel,
  batchLabelFromInstants,
  batchesFor,
  findOpenBatch,
  normalizeDeliveryWindows,
  openBatches,
  windowInstant,
  type DeliveryWindowsConfig,
} from "@/lib/orders/delivery-windows";

/**
 * Delivery batches for a subdivision run: the rider goes out at set times and
 * carries every order in that window, instead of one trip per order.
 *
 * The owner's spec, verbatim: lunch 11–11:30, 11:30–12, 12–12:30, 12:30–1;
 * dinner 4:30–5 through 7:30–8. "Every order from 10:30 to 11 will be
 * delivered within 11 to 11:30. All orders from 11 to 11:30 will be delivered
 * 11:30 to 12."
 */

const cfg: DeliveryWindowsConfig = { ...DEFAULT_DELIVERY_WINDOWS, enabled: true };

/** A Manila wall-clock time on 8 Oct 2026, as the UTC instant it is. */
const ph = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00+08:00`);

describe("the batches", () => {
  it("are exactly the owner's lunch and dinner batches", () => {
    expect(batchesFor(cfg).map((w) => `${w.start}-${w.end}`)).toEqual([
      "11:00-11:30", "11:30-12:00", "12:00-12:30", "12:30-13:00",
      "16:30-17:00", "17:00-17:30", "17:30-18:00", "18:00-18:30",
      "18:30-19:00", "19:00-19:30", "19:30-20:00",
    ]);
  });

  it("keeps a short last batch rather than running past closing", () => {
    const w = batchesFor({ periods: [{ start: "11:00", end: "12:15" }], batchMinutes: 30 });
    expect(w.at(-1)).toEqual({ start: "12:00", end: "12:15" });
  });

  it("never lists a batch twice when periods overlap", () => {
    const w = batchesFor({
      periods: [{ start: "11:00", end: "12:00" }, { start: "11:30", end: "12:30" }],
      batchMinutes: 30,
    });
    expect(w.map((x) => x.start)).toEqual(["11:00", "11:30", "12:00"]);
  });
});

describe("which batch an order can go in — the owner's rule", () => {
  const first = (hhmm: string) => openBatches(cfg, ph(hhmm))[0]?.start;

  it("orders from 10:30 to 11:00 go in the 11:00–11:30 batch", () => {
    expect(first("10:30")).toBe("11:00");
    expect(first("10:59")).toBe("11:00");
  });

  it("orders from 11:00 to 11:30 go in the 11:30–12:00 batch", () => {
    // Exactly 11:00 is too late for the 11:00 batch — it's already leaving.
    expect(first("11:00")).toBe("11:30");
    expect(first("11:29")).toBe("11:30");
  });

  it("an order before lunch opens can still take the first lunch batch", () => {
    expect(first("08:00")).toBe("11:00");
  });

  it("between lunch and dinner, the next batch is the first dinner one", () => {
    expect(first("13:30")).toBe("16:30");
  });

  it("there's nothing left once the last batch has started", () => {
    expect(openBatches(cfg, ph("19:30"))).toEqual([]);
    expect(openBatches(cfg, ph("21:00"))).toEqual([]);
  });

  it("lets the customer pick a later batch, not just the next one", () => {
    expect(openBatches(cfg, ph("10:45")).map((w) => w.start)).toContain("18:00");
  });

  it("a cutoff closes a batch earlier, giving the kitchen time", () => {
    const tight = { ...cfg, cutoffMinutes: 15 };
    expect(openBatches(tight, ph("10:44"))[0].start).toBe("11:00");
    expect(openBatches(tight, ph("10:45"))[0].start).toBe("11:30");
  });

  it("is switched off entirely when not enabled", () => {
    expect(openBatches({ ...cfg, enabled: false }, ph("10:00"))).toEqual([]);
  });
});

describe("the order path re-checks the customer's pick", () => {
  it("accepts an open batch", () => {
    expect(findOpenBatch(cfg, "12:00", ph("11:10"))).toEqual({ start: "12:00", end: "12:30" });
  });

  it("refuses a batch that has already closed", () => {
    // Picked at 10:58, submitted at 11:01 — the 11:00 batch has gone.
    expect(findOpenBatch(cfg, "11:00", ph("11:01"))).toBeNull();
  });

  it("refuses a time that isn't a batch at all", () => {
    expect(findOpenBatch(cfg, "11:15", ph("10:00"))).toBeNull();
    expect(findOpenBatch(cfg, "14:00", ph("10:00"))).toBeNull();
  });
});

describe("Manila time, not server time", () => {
  it("puts 11:00 Manila at 03:00 UTC", () => {
    // The server runs in UTC. A batch computed there would be 8 hours out.
    expect(windowInstant("11:00", ph("10:00")).toISOString()).toBe("2026-10-08T03:00:00.000Z");
  });

  it("uses the Manila day even when UTC has already rolled over", () => {
    // 07:30 Manila on the 8th is 23:30 UTC on the 7th.
    const early = ph("07:30");
    expect(early.toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(windowInstant("11:00", early).toISOString()).toBe("2026-10-08T03:00:00.000Z");
  });
});

describe("labels", () => {
  it("reads like a clock", () => {
    expect(batchLabel({ start: "11:00", end: "11:30" })).toBe("11:00–11:30 AM");
    expect(batchLabel({ start: "11:30", end: "12:00" })).toBe("11:30 AM–12:00 PM");
    expect(batchLabel({ start: "12:30", end: "13:00" })).toBe("12:30–1:00 PM");
    expect(batchLabel({ start: "19:30", end: "20:00" })).toBe("7:30–8:00 PM");
  });

  it("has a plain-ASCII version for the thermal printer", () => {
    expect(batchLabel({ start: "11:30", end: "12:00" }, { ascii: true })).toBe("11:30 AM-12:00 PM");
    expect(batchLabel({ start: "16:30", end: "17:00" }, { ascii: true })).toMatch(/^[\x20-\x7e]+$/);
  });

  it("rebuilds the same label from what's stored on the order", () => {
    expect(
      batchLabelFromInstants("2026-10-08T03:30:00.000Z", "2026-10-08T04:00:00.000Z"),
    ).toBe("11:30 AM–12:00 PM");
  });
});

describe("reading saved settings", () => {
  it("falls back to sensible defaults on garbage rather than breaking the store", () => {
    const n = normalizeDeliveryWindows({ enabled: "yes", batchMinutes: 7, cutoffMinutes: -5 });
    expect(n.enabled).toBe(false);
    expect(n.batchMinutes).toBe(30);
    expect(n.cutoffMinutes).toBe(0);
  });

  it("drops a period that ends before it starts", () => {
    const n = normalizeDeliveryWindows({
      enabled: true,
      periods: [{ start: "13:00", end: "11:00" }, { start: "11:00", end: "13:00" }],
      batchMinutes: 30,
    });
    expect(n.periods).toEqual([{ start: "11:00", end: "13:00" }]);
  });
});
