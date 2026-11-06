import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { syncCommissions } from "@/server/neighborhood/accrual";
import { generateStatement } from "@/server/neighborhood/statements";
import { manilaDate, manilaMonth, previousMonth } from "@/lib/neighborhood/commission";

/**
 * Neighborhood commission run, every 15 minutes. Protected by CRON_SECRET,
 * like the other crons.
 *
 *  1. Accrual: a confirmed entry for every completed platform order of a
 *     neighborhood partner that doesn't have one yet (idempotent), and
 *     cancelled entries for orders since cancelled or refunded. So a delivered
 *     order is on the books within minutes.
 *  2. Once, at 3 AM Manila on the 1st, a draft statement for last month per
 *     partner. Drafts are rebuilt if run again; an issued one is left alone.
 *
 * Touches no standard account: accrual reads only active agreements of
 * restaurants on the neighborhood track.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const now = new Date();
  const sync = await syncCommissions({ now }).catch((e) => {
    console.error("neighborhood cron: sync failed", e);
    return null;
  });

  let drafts = 0;
  // 3:00–3:14 AM Manila on the 1st: the one run of the month that drafts statements.
  const manilaHour = (now.getUTCHours() + 8) % 24;
  if (manilaDate(now).endsWith("-01") && manilaHour === 3 && now.getUTCMinutes() < 15) {
    const month = previousMonth(manilaMonth(now));
    const partners = await systemDb((tx) =>
      tx.territoryPartner.findMany({
        where: { status: { in: ["active", "paused", "ended"] }, restaurant: { commercialTrack: "neighborhood" } },
        select: { id: true },
      }),
    ).catch(() => []);
    for (const p of partners) {
      const r = await generateStatement(p.id, month).catch(() => null);
      if (r?.ok) drafts++;
    }
  }
  return Response.json({ sync, drafts });
}
