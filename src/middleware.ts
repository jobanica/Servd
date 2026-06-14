import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseHost } from "@/lib/host";

/**
 * Host-based multi-tenant routing.
 *  - Platform hosts (servd.app, localhost, *.vercel.app) → served normally;
 *    direct access to the internal /sites segment is blocked.
 *  - Tenant hosts (a *.servd.app subdomain or a connected custom domain) →
 *    rewritten to app/sites/[host]/… which renders the white-label diner pages.
 *
 * No DB calls here (Edge-safe): we route by host *shape*; the restaurant lookup
 * happens in the rewritten Node route.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const info = parseHost(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
  const { pathname, search } = req.nextUrl;

  if (info.kind === "platform") {
    if (pathname.startsWith("/sites")) {
      return new NextResponse("Not found", { status: 404 });
    }
    return NextResponse.next();
  }

  // Tenant host → rewrite to the internal sites segment.
  const rest = pathname === "/" ? "" : pathname;
  const url = new URL(`/sites/${host}${rest}${search}`, req.url);
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip Next internals, API routes, and static files.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
