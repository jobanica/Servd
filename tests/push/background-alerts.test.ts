import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "The merchant app doesn't notify / no sound when it's minimized." Three
 * causes found: pushes went out at normal priority (Android holds those while
 * asleep), a shared tag made one order's alert replace another's, and 26 of
 * 63 shops taking online orders had no phone subscribed at all — with nothing
 * on screen saying so.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("sending", () => {
  const send = read("src/server/push/send.ts");

  it("goes out at high urgency with a short TTL", () => {
    expect(send).toMatch(/export const PUSH_OPTIONS = \{ urgency: "high", TTL: 15 \* 60 \} as const;/);
  });

  it("every push uses those options", () => {
    const calls = send.match(/webpush\.sendNotification\(/g) ?? [];
    const withOpts = send.match(/PUSH_OPTIONS,?\s*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    expect(withOpts.length).toBe(calls.length);
  });

  it("gives each order its own notification", () => {
    expect(send).toMatch(/tag: `order-\$\{payload\.ref\}`/);
  });
});

describe("the notification itself", () => {
  const sw = read("public/sw.js");
  it("is not silent, vibrates, and stays until tapped", () => {
    expect(sw).toMatch(/silent: false/);
    expect(sw).toMatch(/vibrate: \[/);
    expect(sw).toMatch(/requireInteraction: true/);
  });
});

describe("the merchant app says whether this phone will ring", () => {
  const banner = read("src/components/merchant/BackgroundAlerts.tsx");
  const client = read("src/components/merchant/push-client.ts");

  it("tells apart each reason it won't, with its own fix", () => {
    for (const s of ['"off"', '"denied"', '"ios-browser"', '"unsupported"']) {
      expect(banner, s).toContain(`status === ${s}`);
    }
  });

  it("knows an iPhone only gets alerts from the Home Screen app", () => {
    expect(client).toMatch(/if \(isIos\(\) && !isStandalone\(\)\) return "ios-browser";/);
  });

  it("only reports 'on' when the subscription was actually saved", () => {
    expect(client).toMatch(/if \(!saved\.ok\) return "off";/);
  });

  it("is shown on the board", () => {
    expect(read("src/components/merchant/MerchantBoard.tsx")).toMatch(/<BackgroundAlerts \/>/);
  });

  it("has a test that only reaches this restaurant's own device", () => {
    expect(read("src/server/push/actions.ts")).toMatch(
      /where: \{ endpoint: String\(endpoint\)\.slice\(0, 1000\), restaurantId: staff\.restaurantId \}/,
    );
  });
});
