import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The merchant tablet must not sign itself out.
 *
 * It sits on a counter all day waiting for orders, often with nobody touching
 * it. Nothing in the product ever intended to log it out — there is no idle
 * timer anywhere, and production confirms Supabase isn't reaping sessions
 * (none carry a hard expiry and none have been deleted). The session was being
 * thrown away by the app itself, in three places, and these are the rules that
 * stop each one coming back.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the session refresh in middleware", () => {
  const src = read("src/middleware.ts");

  it("only writes cookies back when the renewal actually worked", () => {
    // THE fix. On a failed refresh @supabase/ssr hands over BLANK cookies to
    // clear the session with; writing those deletes a live session because
    // Supabase answered one request badly.
    expect(src).toMatch(/if\s*\(!renewed\)\s*return\s*\[\]/);
  });

  it("checks the result of getUser rather than only catching a throw", () => {
    // A refresh failure does not throw — it comes back as an error value. The
    // try/catch alone never saw it.
    expect(src).toMatch(/const\s*\{\s*data,\s*error\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\)/);
    expect(src).toMatch(/renewed\s*=\s*!error\s*&&\s*!!data\.user/);
  });

  it("does not mutate the request's cookies before it knows", () => {
    // setAll used to write straight into req.cookies, so even returning an
    // empty list left THIS request rendering as signed out.
    const setAll = /setAll:\s*\(list[^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{8}\}/.exec(src)?.[1] ?? "";
    expect(setAll).not.toMatch(/req\.cookies\.set/);
    expect(setAll).toMatch(/pending\.push/);
  });
});

describe("resolving who is signed in", () => {
  const src = read("src/server/tenancy/current-user.ts");

  it("is memoised per request, so one page can't race itself", () => {
    // The merchant page resolves the session in its guard and getMerchantOrders
    // resolves it again. Two auth round-trips against an expiring token is a
    // race with itself: the second presents a refresh token the first just
    // spent, comes back empty, and the screen decides nobody is logged in.
    expect(src).toMatch(/import\s*\{\s*cache\s*\}\s*from\s*"react"/);
    expect(src).toMatch(/export const getCurrentUser = cache\(/);
  });
});

describe("the orders screen", () => {
  const src = read("src/app/(platform)/merchant/page.tsx");

  it("never sends a signed-in shop to the login page over a failed read", () => {
    // It used to turn any UNAUTHORIZED from the queue read into redirect("/login").
    expect(src).not.toMatch(/UNAUTHORIZED|FORBIDDEN/);
    // Exactly one redirect survives: the guard at the top, for someone who
    // genuinely isn't signed in.
    expect(src.match(/redirect\("\/login"\)/g) ?? []).toHaveLength(1);
  });

  it("shows an empty queue instead, and says the list isn't current", () => {
    // Literal strings, not patterns: `??` and `{` are both regex syntax and a
    // pattern here quietly matches the wrong thing.
    expect(src).toMatch(/getMerchantOrders\(\)\.catch\(\(\)\s*=>\s*null\)/);
    expect(src).toContain("initial={initial ?? EMPTY_QUEUE}");
    // An empty board on the screen a shop watches for orders must not be
    // mistakable for a quiet night.
    expect(src).toContain("initialStale={initial === null}");
  });
});

describe("the service worker's page cache", () => {
  const src = read("public/sw.js");

  it("refuses to store a redirect or an error as if it were the page", () => {
    // A request with a lapsed session is answered with the login screen.
    // Cached under /merchant, the Orders app then opens to a sign-in form —
    // signed out in appearance only. A redirected response also can't be
    // replayed for a navigation: returning one throws.
    const guards = src.match(/res(?:ponse)?\.ok\s*&&\s*!res(?:ponse)?\.redirected|fresh\.ok\s*&&\s*!fresh\.redirected/g) ?? [];
    expect(guards.length, "both the fetch handler and the warm-up need the check").toBeGreaterThanOrEqual(2);
  });

  it("was version-bumped so an already-poisoned cache is dropped", () => {
    const version = /const VERSION = "(servd-v\d+)"/.exec(src)?.[1];
    expect(version).toBeTruthy();
    const n = Number(version!.replace("servd-v", ""));
    expect(n).toBeGreaterThanOrEqual(6);
  });
});

describe("nothing signs anyone out on a timer", () => {
  it("has no idle or inactivity logout anywhere in the app", () => {
    // Stated as a test because the request was explicit: the merchant app is
    // the one receiving orders, so it must never log out on its own.
    const files = [
      "src/components/merchant/MerchantBoard.tsx",
      "src/components/merchant/SignOutButton.tsx",
      "src/middleware.ts",
      "src/app/(platform)/merchant/page.tsx",
    ];
    for (const f of files) {
      expect(read(f), `${f} must not sign out on a timer`).not.toMatch(
        /set(?:Timeout|Interval)\([^)]*sign[Oo]ut/,
      );
    }
  });
});
