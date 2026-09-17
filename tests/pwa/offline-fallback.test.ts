import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The offline fallback, asserted at the source.
 *
 * The service worker is plain JS served to browsers rather than app code, so it
 * has no seam to unit-test through. These check the two properties that matter
 * and that a careless edit would quietly undo.
 *
 * The bug being pinned: a navigation to an uncached page used to fall back to
 * the cached /cashier. Ask to sign in during a dropout and you got a till
 * screen that looked live, wasn't, and would never save anything.
 */

const SW = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const OFFLINE = join(process.cwd(), "public/offline.html");

describe("the offline page exists", () => {
  it("ships as a static file", () => {
    // It has to be reachable with no server and no framework, so it cannot be
    // a Next route.
    expect(existsSync(OFFLINE)).toBe(true);
  });

  it("explains that signing in needs a connection", () => {
    const html = readFileSync(OFFLINE, "utf8");
    expect(html.toLowerCase()).toContain("offline");
    expect(html).toMatch(/sign(ing)? in/i);
  });

  it("reassures them that queued orders are safe", () => {
    // The first thing a cashier fears when a screen changes mid-shift.
    expect(readFileSync(OFFLINE, "utf8")).toMatch(/already taken are safe/i);
  });
});

describe("the service worker", () => {
  it("precaches the offline page at install", () => {
    // Cached-on-visit is no good for the one page needed when nothing loads.
    expect(SW).toMatch(/install/);
    expect(SW).toMatch(/cache\.add\(/);
    expect(SW).toContain('OFFLINE_PAGE = "/offline.html"');
  });

  it("never substitutes the till for a page that was not cached", () => {
    // The whole point. Any reintroduced `caches.match("/cashier")` fallback
    // brings back a sign-in attempt that appears to succeed.
    expect(SW).not.toMatch(/caches\.match\(\s*["']\/cashier["']\s*\)/);
  });

  it("still serves a page that WAS cached, which is what offline mode buys", () => {
    expect(SW).toMatch(/const cached = await caches\.match\(req\)/);
  });

  it("leaves writes alone so the outbox owns them", () => {
    expect(SW).toMatch(/req\.method !== "GET"/);
  });

  it("bumped its version so installed tills pick the change up", () => {
    // Caches are keyed by this prefix and cleaned on activate; without a bump
    // an already-installed device keeps the old worker and the old fallback.
    const version = SW.match(/const VERSION = "servd-v(\d+)"/);
    expect(version).not.toBeNull();
    expect(Number(version![1])).toBeGreaterThanOrEqual(5);
  });
});
