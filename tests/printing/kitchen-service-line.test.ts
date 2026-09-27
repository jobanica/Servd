import { describe, it, expect } from "vitest";
import {
  buildTicket,
  ticketLines,
  ticketServiceLine,
  WIDTH,
  type TicketSource,
} from "@/lib/printing/ticket";
import { encodeTicket } from "@/lib/printing/escpos";
import { ORDER_TYPES } from "@/lib/orders/order-type";

/**
 * Plate it or pack it.
 *
 * Reported from a real docket: a dine-in kitchen ticket read "TABLE 1" and
 * nothing else, so the only thing telling the kitchen how to send the food out
 * was the absence of the word TAKEOUT. Inferring from what ISN'T printed is
 * not something to ask of a cook mid-service.
 */

const base: TicketSource = {
  kind: "kitchen",
  restaurantName: "DC's Silogan",
  tableNumber: "1",
  orderId: "c5c99c16-0000",
  createdAt: "2026-09-27T05:13:00.000Z",
  total: 29_900,
  items: [{ quantity: 1, name: "Spaghetti Solo", modifiers: [], lineTotal: 29_900 }],
};

const ticket = (over: Partial<TicketSource> = {}) => buildTicket({ ...base, ...over });

describe("the kitchen docket", () => {
  it("says DINE-IN on the ticket that used to say only TABLE 1", () => {
    // THE reported case.
    const lines = ticketLines(ticket({ orderType: "dine_in" }));
    expect(lines).toContain("TABLE 1");
    expect(lines).toContain("*** DINE-IN ***");
  });

  it("says TAKEOUT when it's going in a bag", () => {
    expect(ticketServiceLine(ticket({ orderType: "takeout" }))).toBe("*** TAKEOUT ***");
  });

  it("names every order type the app can take", () => {
    // No type may print a blank where the kitchen expects a word.
    for (const type of ORDER_TYPES) {
      const line = ticketServiceLine(ticket({ orderType: type }));
      expect(line, `${type} should be named on the docket`).toBeTruthy();
      expect(line).toMatch(/^\*\*\* [A-Z-]+ \*\*\*$/);
    }
  });

  it("keeps pickup and takeout apart, because the kitchen assembles them differently", () => {
    expect(ticketServiceLine(ticket({ orderType: "takeout" }))).not.toBe(
      ticketServiceLine(ticket({ orderType: "pickup" })),
    );
  });

  it("sits with the KITCHEN label, where a cook actually looks", () => {
    const lines = ticketLines(ticket({ orderType: "takeout" }));
    expect(lines.indexOf("*** TAKEOUT ***")).toBe(lines.indexOf("*** KITCHEN ***") + 1);
  });

  it("fits on 58mm paper", () => {
    for (const type of ORDER_TYPES) {
      expect(ticketServiceLine(ticket({ orderType: type }))!.length).toBeLessThanOrEqual(WIDTH);
    }
  });

  it("is plain ASCII, so a codepage printer doesn't render it as junk", () => {
    // The encoder drops anything past 0xFF, and a pretty separator like "·"
    // comes out of a CP437 printer as a box-drawing character.
    for (const type of ORDER_TYPES) {
      expect(ticketServiceLine(ticket({ orderType: type }))!).toMatch(/^[\x20-\x7e]+$/);
    }
  });

  it("reaches the thermal printer, not just the HTML preview", () => {
    // Both renderers, because this file has shipped a field to one and not the
    // other twice before.
    const bytes = encodeTicket(ticket({ orderType: "takeout" }));
    expect(Buffer.from(bytes).toString("latin1")).toContain("*** TAKEOUT ***");
  });
});

describe("the bill and the receipt", () => {
  it("carry no service line — the heading already says it", () => {
    // And the diner is not the one deciding whether it goes in a tub.
    expect(ticketServiceLine(ticket({ kind: "bill", orderType: "takeout" }))).toBeNull();
    expect(ticketServiceLine(ticket({ kind: "receipt", orderType: "takeout" }))).toBeNull();
  });

  it("are otherwise unchanged", () => {
    const lines = ticketLines(ticket({ kind: "receipt", orderType: "dine_in" }));
    expect(lines.filter((l) => l.includes("DINE-IN"))).toHaveLength(0);
  });
});
