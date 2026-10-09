import type { NextRequest, NextResponse } from "next/server";
// Directly, never via "@/lib/agent-kit": that barrel pulls in node:crypto,
// which the Edge runtime middleware runs on does not have.
import { REF_COOKIE, REF_COOKIE_OPTIONS, refFromSearchParams } from "@/lib/agent-kit/ref";

/**
 * CANVEXIA sales agents: ?ref=CODE on ANY page goes into a 30-day cookie, so a
 * visitor is attributed even if they sign up days later from another page.
 *
 * The first agent's link wins — an existing cookie is never overwritten.
 * Anything in ?ref= that cannot be a code (an old invite marker, junk) is
 * simply "no code" and writes nothing.
 */
export function captureAgentRef(req: NextRequest, res: NextResponse): NextResponse {
  if (req.cookies.get(REF_COOKIE)?.value) return res;
  const code = refFromSearchParams(req.nextUrl.searchParams);
  if (code) res.cookies.set(REF_COOKIE, code, REF_COOKIE_OPTIONS);
  return res;
}
