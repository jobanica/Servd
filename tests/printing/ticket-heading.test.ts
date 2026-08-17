import { describe, it, expect } from "vitest";
import { buildTicket, ticketHeading, type TicketSource } from "@/lib/printing/ticket";

/**
 * What gets shouted across the room.
 *
 * A dine-in order doesn't always have a table: plenty of shops ring the order
 * up at the counter and seat people afterwards, and some have no floor plan at
 * all. Requiring one stopped those shops taking an order they were standing in
 * front of. Without a table the ticket carries the day's next number, and
 * that's what the customer gets called by.
 */

const base: TicketSource = {
  restaurantName: "Lola's Kitchen",
  tableNumber: "—",
  orderId: "abcdef01-2345",
  createdAt: "2026-08-17T04:00:00.000Z",
  total: 26_900,
  items: [{ quantity: 1, name: "Crispy Chicken", modifiers: [], lineTotal: 26_900 }],
};

const heading = (over: Partial<TicketSource>) => ticketHeading(buildTicket({ ...base, ...over }));

describe("dine-in", () => {
  it("uses the table when there is one", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "5" })).toBe("TABLE 5");
  });

  it("uses the ticket number when there isn't", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "#001" })).toBe("ORDER #001");
  });

  // "TABLE —" is not something anyone can call out.
  it("never prints an empty table", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "—" })).toBe("ORDER");
    expect(heading({ orderType: "dine_in", tableNumber: "" })).toBe("ORDER");
  });

  it("doesn't call a ticket number a table", () => {
    expect(heading({ orderType: "dine_in", tableNumber: "#012" })).not.toContain("TABLE");
  });
});

describe("everything else is unchanged", () => {
  it("still names the customer on a pickup", () => {
    expect(heading({ orderType: "takeout", customerName: "Ana" })).toContain("Ana");
  });

  it("still names the customer on a delivery", () => {
    const out = heading({ orderType: "delivery", customerName: "Ana" });
    expect(out).toContain("DELIVERY");
    expect(out).toContain("Ana");
  });
});
