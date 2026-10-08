import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTicket, ticketLines, ticketServiceLine, WIDTH, type TicketSource } from "@/lib/printing/ticket";
import { groupByBatch, stripBatchTag } from "@/lib/orders/delivery-windows";

/**
 * Delivery batches end to end: the customer's pick is re-checked by the order
 * path, the Orders app groups by run, and the kitchen docket says which run.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const kitchen: TicketSource = {
  kind: "kitchen",
  restaurantName: "Test Kitchen",
  tableNumber: "-",
  orderType: "delivery",
  orderId: "abcd1234-0000",
  createdAt: "2026-10-08T02:40:00.000Z",
  total: 15_000,
  items: [{ quantity: 1, name: "Tapsilog", modifiers: [], lineTotal: 15_000 }],
};

describe("the kitchen docket on a batch order", () => {
  it("says which run it goes out on", () => {
    const t = buildTicket({ ...kitchen, deliveryWindow: "11:00-11:30 AM" });
    expect(ticketServiceLine(t)).toBe("*** DELIVERY 11:00-11:30 AM ***");
    expect(ticketLines(t)).toContain("*** DELIVERY 11:00-11:30 AM ***");
  });

  it("still fits 58mm paper when the batch straddles noon", () => {
    const line = ticketServiceLine(buildTicket({ ...kitchen, deliveryWindow: "11:30 AM-12:00 PM" }))!;
    expect(line).toContain("11:30 AM-12:00 PM");
    expect(line.length).toBeLessThanOrEqual(WIDTH);
    expect(line).toMatch(/^[\x20-\x7e]+$/);
  });

  it("is unchanged for a delivery that isn't in a batch", () => {
    expect(ticketServiceLine(buildTicket(kitchen))).toBe("*** DELIVERY ***");
  });

  it("never puts the batch on the customer's receipt line", () => {
    expect(ticketServiceLine(buildTicket({ ...kitchen, kind: "receipt", deliveryWindow: "11:00-11:30 AM" }))).toBeNull();
  });

  it("is read by both ticket builders, not just one", () => {
    // This codebase has shipped a field to one builder and not the other.
    for (const p of ["src/server/printing/print.ts", "src/server/printing/ticket-query.ts"]) {
      const src = read(p);
      expect(src, p).toMatch(/deliveryWindowStart: true/);
      expect(src, p).toMatch(/deliveryWindow,/);
    }
  });
});

describe("the Orders app, grouped by run", () => {
  const o = (id: string, start: string | null, end: string | null) => ({
    id,
    deliveryWindowStart: start,
    deliveryWindowEnd: end,
  });

  it("puts each batch together, earliest run first, loose orders on top", () => {
    const groups = groupByBatch([
      o("a", "2026-10-08T04:00:00.000Z", "2026-10-08T04:30:00.000Z"), // 12:00
      o("b", "2026-10-08T03:00:00.000Z", "2026-10-08T03:30:00.000Z"), // 11:00
      o("c", null, null),
      o("d", "2026-10-08T03:00:00.000Z", "2026-10-08T03:30:00.000Z"), // 11:00
    ]);
    expect(groups.map((g) => g.label)).toEqual([null, "11:00–11:30 AM", "12:00–12:30 PM"]);
    expect(groups[1].orders.map((x) => x.id)).toEqual(["b", "d"]);
  });

  it("has no groups at all for a store that doesn't use batches", () => {
    const groups = groupByBatch([o("a", null, null), o("b", null, null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].start).toBeNull();
  });

  it("drops the batch tag from the address once it's shown as a badge", () => {
    expect(stripBatchTag("[Deliver 11:00-11:30 AM] [Phase 2 · delivery ₱20.00] Blk 4 Lot 7")).toBe(
      "[Phase 2 · delivery ₱20.00] Blk 4 Lot 7",
    );
    expect(stripBatchTag("Blk 4 Lot 7")).toBe("Blk 4 Lot 7");
  });

  it("reads the batch columns apart from the other optional fields", () => {
    // Folded into loadExtras' fast path, an unmigrated DB would knock the
    // payment receipt and the rider note onto the slow path too.
    const src = read("src/server/orders/merchant.ts");
    const fast = src.slice(src.indexOf("// Fast path"), src.indexOf("return map;"));
    expect(fast).not.toMatch(/deliveryWindow/);
    expect(src).toMatch(/async function loadWindows/);
  });
});

describe("the order path", () => {
  const src = read("src/server/orders/web-order.ts");

  it("re-checks the customer's pick against the clock", () => {
    expect(src).toMatch(/findOpenBatch\(windows, d\.deliveryBatch, now\)/);
    expect(src).toMatch(/That delivery time has just closed/);
  });

  it("requires a pick when the store delivers in batches", () => {
    expect(src).toMatch(/if \(!d\.deliveryBatch\) return \{ ok: false/);
  });

  it("lets a batch order through while the store is closed, but never past a manual pause", () => {
    expect(src).toMatch(/!scheduledFor && !batch && storefront\.pauseWhenClosed/);
    // The owner's pause is checked first and has no batch exemption.
    expect(src.indexOf("if (storefront.ordersPaused)")).toBeLessThan(src.indexOf("const batchesOn"));
  });

  it("writes the batch columns on their own, so a lagging DB still takes the order", () => {
    const create = src.slice(src.indexOf("const extra = {"), src.indexOf("let order;"));
    expect(create).not.toMatch(/deliveryWindow/);
    expect(src).toMatch(/updateMany\(\{\s*where: \{ id: order\.id \},\s*data: \{ deliveryWindowStart/);
  });

  it("puts the batch on the address line in plain ASCII", () => {
    expect(src).toMatch(/batchLabel\(w, \{ ascii: true \}\)/);
    expect(src).toMatch(/\[Deliver \$\{batch\.label\}\]/);
  });
});

describe("the settings save", () => {
  it("only touches batches when the section was on the page", () => {
    // Another settings form posting without these fields mustn't switch
    // batches off.
    const src = read("src/server/storefront/actions.ts");
    expect(src).toMatch(/formData\.has\("windowsField"\)/);
    expect(src).toMatch(/: saved\.delivery\.windows/);
  });
});
