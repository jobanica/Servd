import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * What the middleware does to the session cookies, exercised for real.
 *
 * The bug: when a token refresh fails, @supabase/ssr calls setAll with BLANK
 * cookies — that is how it clears a session. The middleware wrote whatever it
 * was handed, so one bad answer from Supabase deleted a live session and the
 * merchant tablet was at the login screen the next time anyone looked at it.
 *
 * A refresh failure does not throw. It comes back as an error value, which is
 * why the try/catch that was already there never saw it.
 */

type SetAll = (list: { name: string; value: string; options?: unknown }[]) => void;

// The fake Supabase client. Each test decides what getUser does to the cookies
// and what it returns, exactly as the real one would.
let behaviour: (setAll: SetAll) => { data: { user: unknown }; error: unknown };

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { getAll: () => unknown; setAll: SetAll } },
  ) => ({
    auth: {
      getUser: async () => behaviour(opts.cookies.setAll),
    },
  }),
}));

import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const FRESH = { name: "sb-abc-auth-token", value: "fresh-token", options: { path: "/" } };
const CLEARED = { name: "sb-abc-auth-token", value: "", options: { path: "/", maxAge: 0 } };

function request(cookie = "sb-abc-auth-token=stale-token") {
  return new NextRequest("https://app.servdph.com/merchant", {
    headers: { host: "app.servdph.com", cookie },
  });
}

/** The Set-Cookie values the middleware decided to send back. */
async function sentCookies(req: NextRequest) {
  const res = await middleware(req);
  return res.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = "servdph.com";
});

describe("a session that renews", () => {
  it("writes the new token back to the browser", async () => {
    behaviour = (setAll) => {
      setAll([FRESH]);
      return { data: { user: { id: "u1" } }, error: null };
    };
    const sent = await sentCookies(request());
    expect(sent).toContainEqual({ name: FRESH.name, value: "fresh-token" });
  });
});

describe("a renewal that fails", () => {
  it("does NOT clear the session cookie", async () => {
    // THE test. Supabase says no and hands over blank cookies to clear with.
    // Writing those is what signed the shop out.
    behaviour = (setAll) => {
      setAll([CLEARED]);
      return { data: { user: null }, error: { message: "Invalid Refresh Token: Already Used" } };
    };
    const sent = await sentCookies(request());
    expect(sent.find((c) => c.name === CLEARED.name)).toBeUndefined();
  });

  it("does not clear it when Supabase is simply unreachable", async () => {
    behaviour = () => {
      throw new Error("fetch failed");
    };
    const sent = await sentCookies(request());
    expect(sent.find((c) => c.name === CLEARED.name)).toBeUndefined();
  });

  it("ignores a blank user even when no error is reported", async () => {
    behaviour = (setAll) => {
      setAll([CLEARED]);
      return { data: { user: null }, error: null };
    };
    const sent = await sentCookies(request());
    expect(sent.find((c) => c.name === CLEARED.name)).toBeUndefined();
  });
});

describe("requests that carry no session", () => {
  it("never calls Supabase at all", async () => {
    let called = false;
    behaviour = () => {
      called = true;
      return { data: { user: null }, error: null };
    };
    await middleware(request("something-else=1"));
    expect(called).toBe(false);
  });
});
