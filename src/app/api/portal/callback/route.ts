import { NextResponse } from "next/server";
import { verifyCallback } from "@/lib/agent-kit";
import { portalConfig } from "@/server/agent-portal/config";
import { applyPortalCallback } from "@/server/agent-portal/callbacks";
import { systemDb } from "@/server/tenancy/scoped-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/callback — contract.signed and payment.confirmed /
 * rejected / reversed from the CANVEXIA agent portal. This is the URL to
 * register as the product's callback URL in the portal.
 *
 * The raw body is read FIRST and verified exactly as received; it is parsed
 * only after the signature checks out (re-serialising parsed JSON would change
 * key order and whitespace and fail a genuine request).
 *
 *   200  applied, or a duplicate (answered 200 so the portal stops resending)
 *   401  bad or stale signature
 *   503  this deployment has no portal configuration
 *   500  internal failure — the portal retries
 */
export async function POST(req: Request) {
  const config = portalConfig();
  if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const rawBody = await req.text();
  if (rawBody.length > 64 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const verified = verifyCallback(config, req, rawBody);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: verified.status });

  try {
    const outcome = await systemDb((tx) => applyPortalCallback(tx, verified.callback));
    return NextResponse.json({ event_id: verified.callback.event_id, outcome });
  } catch (e) {
    console.error("[portal/callback]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
