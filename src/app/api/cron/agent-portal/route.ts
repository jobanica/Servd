import { NextRequest } from "next/server";
import { suspendLapsedAccounts, type SweepSummary } from "@/server/agent-portal/sweep";
import { drainOutbox } from "@/server/agent-portal/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The agent-portal worker (vercel.json: every minute).
 *
 * The lapse sweep runs first and the outbox drains second, so a
 * customer.cancelled queued by the sweep goes out on the same tick. A failing
 * sweep is logged and does NOT stop the queue draining.
 *
 * Guarded by CRON_SECRET like every Servd cron. With no secret set the guard
 * is skipped only outside production, so local dev can hit it by hand.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("Unauthorized", { status: 401 });
  }

  let sweep: SweepSummary | { error: string };
  try {
    sweep = await suspendLapsedAccounts();
  } catch (e) {
    console.error("[agent-portal] sweep failed; draining anyway:", e);
    sweep = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const drain = await drainOutbox();
    return Response.json({ sweep, drain });
  } catch (e) {
    console.error("[agent-portal] drain failed:", e);
    return Response.json({ sweep, drain: { error: e instanceof Error ? e.message : String(e) } }, { status: 500 });
  }
}
