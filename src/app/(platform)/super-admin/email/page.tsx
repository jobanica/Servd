import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { countAllSegments } from "@/server/email/audience";
import { listCampaigns } from "@/server/email/campaigns";
import { getEmailStatus } from "@/server/email/provider";
import {
  getAutomation,
  runAutomation,
  CATCH_UP_DAYS,
  MIN_HOURS_BEFORE_FIRST,
} from "@/server/email/automation";
import { SEGMENTS } from "@/lib/email/segments";
import { EmailComposer } from "@/components/super-admin/EmailComposer";
import { EmailSettingsForm } from "@/components/super-admin/EmailSettingsForm";
import { EmailAutomation } from "@/components/super-admin/EmailAutomation";

export const dynamic = "force-dynamic";

const SEGMENT_LABEL = new Map(SEGMENTS.map((s) => [s.key, s.label]));

/**
 * Email marketing to the founder's own leads — the restaurant owners who gave
 * an address on the DIY builder. Deliberately separate from the per-restaurant
 * SMS campaigns, which go to a tenant's diners.
 */
export default async function EmailMarketingPage() {
  await requireSuperAdminPage();
  const [counts, campaigns, status, automation, preview] = await Promise.all([
    countAllSegments(),
    listCampaigns(),
    getEmailStatus(),
    getAutomation(),
    // Dry run: how many each step would reach right now, without sending.
    runAutomation({ dryRun: true }),
  ]);
  const dueNow: Record<number, number> = {};
  for (const s of preview.steps) dueNow[s.dayOffset] = s.due;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Email marketing</h1>
        <p className="text-sm text-plum-ink/50">
          Follow up with the owners who built a page at <span className="font-mono">/build</span>.
        </p>
      </div>

      <EmailAutomation
        enabled={automation.enabled}
        steps={automation.steps}
        dueNow={dueNow}
        catchUpDays={CATCH_UP_DAYS}
        minHours={MIN_HOURS_BEFORE_FIRST}
      />

      <EmailComposer counts={counts} configured={status.configured} />

      {campaigns.length > 0 && (
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-plum-ink/45">
              <tr>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Audience</th>
                <th className="px-4 py-2">Sent</th>
                <th className="px-4 py-2">Failed</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-plum-ink/5">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-semibold">{c.subject}</td>
                  <td className="px-4 py-2 text-xs text-plum-ink/60">
                    {SEGMENT_LABEL.get(c.segment as never) ?? c.segment}
                  </td>
                  <td className="px-4 py-2">
                    {c.sent}/{c.recipients}
                  </td>
                  <td className={`px-4 py-2 ${c.failed > 0 ? "font-semibold text-guava" : ""}`}>
                    {c.failed}
                  </td>
                  <td className="px-4 py-2 text-xs text-plum-ink/50">
                    {c.sentAt ? new Date(c.sentAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EmailSettingsForm initial={status} />
    </div>
  );
}
