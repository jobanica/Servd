import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parseHost } from "@/lib/host";

/**
 * Host-based multi-tenant routing.
 *  - Platform hosts (servd.app, localhost, *.vercel.app) → served normally;
 *    direct access to the internal /sites segment is blocked.
 *  - Tenant hosts (a *.servd.app subdomain or a connected custom domain) →
 *    rewritten to app/sites/[host]/… which renders the white-label diner pages.
 *
 * It ALSO keeps the logged-in session alive (see refreshSession below).
 *
 * No DB calls here (Edge-safe): we route by host *shape*; the restaurant lookup
 * happens in the rewritten Node route.
 */
// Referral attribution: capture ?ref=CODE into a 30-day, last-touch cookie that
// signup later reads. Edge-safe (no DB). Sanitized + length-capped.
const REF_COOKIE = "servd_ref";
const REF_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function captureRef(req: NextRequest, res: NextResponse): NextResponse {
  const raw = req.nextUrl.searchParams.get("ref");
  if (raw) {
    const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
    if (code) {
      res.cookies.set(REF_COOKIE, code, {
        maxAge: REF_MAX_AGE,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    }
  }
  return res;
}

type PendingCookie = { name: string; value: string; options?: Record<string, unknown> };

/**
 * Keeps staff signed in. Supabase access tokens are short-lived and have to be
 * swapped for a fresh one using the refresh token. Server Components can't
 * write cookies, so without doing it here the session quietly dies once the
 * access token expires — the app looks like it "auto signed out" while it was
 * just sitting open. Calling getUser() renews the token when needed and hands
 * back the cookies to write onto whatever response we send.
 *
 * Mutates req.cookies so the current request already sees the new token, and
 * returns the cookies to copy onto the response for the browser.
 */
async function refreshSession(req: NextRequest): Promise<PendingCookie[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  // Only talk to Supabase when this request actually carries a session — public
  // diner/storefront traffic skips the round-trip entirely.
  const hasSession = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasSession) return [];

  const pending: PendingCookie[] = [];
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: PendingCookie[]) => {
          for (const c of list) {
            req.cookies.set(c.name, c.value);
            pending.push(c);
          }
        },
      },
    });
    await supabase.auth.getUser();
  } catch {
    /* Supabase unreachable — keep serving with the cookies we already have
       rather than bouncing the user to /login. */
  }
  return pending;
}

function withSession(res: NextResponse, cookies: PendingCookie[]): NextResponse {
  for (const c of cookies) res.cookies.set(c.name, c.value, c.options);
  return res;
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const { pathname, search } = req.nextUrl;

  // Public tutorials hub on its own subdomain (tutorials.<root>) → serve the
  // /tutorials route. Also reachable at <root>/tutorials directly.
  if (rootDomain && host === `tutorials.${rootDomain.toLowerCase()}`) {
    const rest = pathname === "/" ? "" : pathname;
    const url = new URL(`/tutorials${rest}${search}`, req.url);
    return captureRef(req, NextResponse.rewrite(url));
  }

  const info = parseHost(host, rootDomain);

  if (info.kind === "platform") {
    if (pathname.startsWith("/sites")) {
      return new NextResponse("Not found", { status: 404 });
    }
    // Renew the session before rendering, so an expired access token is
    // refreshed instead of logging staff out mid-shift.
    const session = await refreshSession(req);
    return withSession(captureRef(req, NextResponse.next({ request: req })), session);
  }

  // Tenant host → rewrite to the internal sites segment.
  const rest = pathname === "/" ? "" : pathname;
  const url = new URL(`/sites/${host}${rest}${search}`, req.url);
  return captureRef(req, NextResponse.rewrite(url));
}

export const config = {
  // Skip Next internals, API routes, and static files.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
