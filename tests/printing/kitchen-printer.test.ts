import { describe, it, expect } from "vitest";
import { parsePrinterConfig, kitchenDestination } from "@/lib/printing/printer-config";

/**
 * A restaurant with a printer at the pass and no kitchen screen: the docket
 * should come out THERE, and the cashier's roll should be left for the bill.
 *
 * The risk in routing to a second printer is routing to nowhere. A ticket sent
 * to a half-configured destination is a missed order, so every incomplete case
 * has to fall back to the till printer, which is at least attended.
 */

const cfg = (kitchen: Record<string, unknown>) =>
  parsePrinterConfig({ kitchen }).kitchen;

describe("kitchenDestination", () => {
  it("is off unless asked for — one printer keeps doing both", () => {
    expect(kitchenDestination(cfg({}))).toBeNull();
    expect(kitchenDestination(cfg({ method: "network", bridgeUrl: "http://x/print" }))).toBeNull();
  });

  it("routes to the kitchen's own bridge agent", () => {
    const d = kitchenDestination(
      cfg({ separate: true, method: "network", bridgeUrl: "http://192.168.1.60:8080/print" }),
    );
    expect(d).toEqual({
      method: "network",
      bridgeUrl: "http://192.168.1.60:8080/print",
      pollToken: null,
    });
  });

  it("routes to the kitchen's own poll token", () => {
    const d = kitchenDestination(cfg({ separate: true, method: "cloud", pollToken: "kt0k3n" }));
    expect(d?.method).toBe("cloud");
    expect(d?.pollToken).toBe("kt0k3n");
  });

  it("falls back to the till when the destination is incomplete", () => {
    // Switched on but never filled in: printing at the till beats printing
    // into a void, because somebody is standing at the till.
    expect(kitchenDestination(cfg({ separate: true, method: "network" }))).toBeNull();
    expect(kitchenDestination(cfg({ separate: true, method: "cloud" }))).toBeNull();
    expect(kitchenDestination(cfg({ separate: true }))).toBeNull();
  });

  it("ignores a blank bridge URL rather than treating it as configured", () => {
    expect(
      kitchenDestination(cfg({ separate: true, method: "network", bridgeUrl: "   " })),
    ).toBeNull();
  });

  it("refuses a browser transport — it can't reach another room", () => {
    // Bluetooth is paired to the cashier's tab and the OS dialog prints to
    // whatever that device selected; neither can be aimed at the pass.
    expect(cfg({ separate: true, method: "bluetooth" }).method).toBeNull();
    expect(kitchenDestination(cfg({ separate: true, method: "os_dialog" }))).toBeNull();
  });

  it("leaves every existing restaurant untouched", () => {
    // No `kitchen` key at all — the shape before a second printer existed.
    const k = parsePrinterConfig({ receipt: { phone: "0917" } }).kitchen;
    expect(k.separate).toBe(false);
    expect(kitchenDestination(k)).toBeNull();
  });

  it("keeps the kitchen's poll token distinct from the till's", () => {
    // Same token on both would make the endpoint unable to tell them apart,
    // and the wrong printer would drain the other's queue.
    const parsed = parsePrinterConfig({
      pollToken: "till-token",
      kitchen: { separate: true, method: "cloud", pollToken: "kitchen-token" },
    });
    expect(parsed.pollToken).toBe("till-token");
    expect(parsed.kitchen.pollToken).toBe("kitchen-token");
  });
});
