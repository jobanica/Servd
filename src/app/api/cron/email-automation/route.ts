import { NextRequest } from "next/server";
import { runAutomation } from "@/server/email/automation";

/**
 * Nightly follow-up run (configured in vercel.json). Protected by CRON_SECRET,
 * same as the billing cron. Safe to call more than once — the unique index on
 * (step, lead) means a repeat run sends nothing extra.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runAutomation());
}
