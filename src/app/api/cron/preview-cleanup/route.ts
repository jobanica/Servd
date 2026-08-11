import { NextRequest } from "next/server";
import { runPreviewCleanup } from "@/server/build/cleanup";

/**
 * Nightly DIY-preview housekeeping (add to vercel.json). Protected by
 * CRON_SECRET, same as the billing cron.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runPreviewCleanup());
}
