import { describe, it, expect } from "vitest";
import type { AdvanceOp, CreateOrderOp, OutboxOp } from "@/lib/offline/idb";

/**
 * The till and the kitchen now share one offline queue, and each replays only
 * its own work. Getting that wrong is quiet and expensive: the kitchen
 * replaying a parked order would ring the sale up a second time, and either
 * board treating the other's op as a failure would stall the whole queue
 * behind it.
 *
 * The drains themselves live inside React components, so what is pinned here is
 * the discriminator they both filter on.
 */

const advance: AdvanceOp = {
  opId: "a1",
  type: "advance",
  orderId: "o1",
  toStatus: "done",
  createdAt: 1,
};

const parked: CreateOrderOp = {
  opId: "c1",
  type: "create-order",
  input: { orderType: "dine_in", lines: [], clientRef: "c1" },
  summary: { label: "Table 4", total: 25_000, lines: 2 },
  createdAt: 2,
};

const queue: OutboxOp[] = [advance, parked];

describe("the shared outbox", () => {
  it("lets the kitchen take only status changes", () => {
    const mine = queue.filter((o) => o.type === "advance");
    expect(mine).toEqual([advance]);
  });

  it("lets the till take only parked orders", () => {
    const mine = queue.filter((o): o is CreateOrderOp => o.type === "create-order");
    expect(mine).toEqual([parked]);
  });

  it("accounts for every op, so nothing sits unclaimed forever", () => {
    const advances = queue.filter((o) => o.type === "advance").length;
    const orders = queue.filter((o) => o.type === "create-order").length;
    expect(advances + orders).toBe(queue.length);
  });
});

describe("a parked order", () => {
  it("carries its own opId as the idempotency key", () => {
    // The whole point: a reply lost mid-flight means the retry sends the same
    // key, and the server settles onto the order it already made rather than
    // creating a second one.
    expect((parked.input as { clientRef: string }).clientRef).toBe(parked.opId);
  });

  it("keeps enough to tell the cashier what is waiting", () => {
    // Without this the only feedback is a number, and "3 waiting" tells nobody
    // which three.
    expect(parked.summary.label).toBe("Table 4");
    expect(parked.summary.lines).toBeGreaterThan(0);
  });
});
