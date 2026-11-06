import { NextRequest } from "next/server";
import { syncCommissions } from "@/server/neighborhood/accrual";
import { runWeeklyStatements } from "@/server/neighborhood/statements";
import { isSaturday, manilaDate } from "@/lib/neighborhood/commission";

/**
 * Neighborhood commission run, every 15 minutes. Protected by CRON_SECRET,
 * like the other crons.
 *
 *  1. Accrual: a confirmed entry for every completed platform order of a
 *     neighborhood partner that doesn't have one yet (idempotent), and
 *     cancelled entries for orders since cancelled or refunded. So a delivered
 *     order is on the books within minutes.
 *  2. Saturday, in the first run after midnight Manila: each partner's
 *     statement for the week before (Saturday to Friday), issued and due that
 *     Saturday. Accrual runs first, so Friday night's orders are on it.
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

  // 00:00–00:14 Manila on a Saturday: the one run of the week that bills.
  const today = manilaDate(now);
  const manilaHour = (now.getUTCHours() + 8) % 24;
  let weekly = null;
  if (isSaturday(today) && manilaHour === 0 && now.getUTCMinutes() < 15) {
    weekly = await runWeeklyStatements(today, now).catch((e) => {
      console.error("neighborhood cron: weekly statements failed", e);
      return null;
    });
  }
  return Response.json({ sync, weekly });
}
