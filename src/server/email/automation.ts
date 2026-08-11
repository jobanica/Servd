import "server-only";

import { randomBytes } from "node:crypto";
import { systemDb } from "@/server/tenancy/scoped-db";
import { renderEmail, buildRecipientLinks } from "@/lib/email/render";
import { dueRange, hasWaitedMinimum, CATCH_UP_DAYS, MIN_HOURS_BEFORE_FIRST } from "@/lib/email/schedule";
import { getEmailCreds, sendBatch, type OutgoingEmail } from "./provider";

/**
 * The automated follow-up sequence: N steps, each fired a set number of days
 * after someone creates a preview at /build.
 *
 * Three rules make it safe to run on a cron and safe to edit while it's live:
 *
 *  1. It only ever looks at restaurants that are STILL unpaid previews, so the
 *     sequence stops the moment someone activates. Nobody gets nagged to buy
 *     something they already bought.
 *  2. One row per (step, lead) with a unique index — a re-run, an overlapping
 *     run, or a retry can't send the same follow-up twice.
 *  3. A step is due for a few days, not forever (see CATCH_UP_DAYS), so a
 *     missed cron run catches up but a newly-added step doesn't retro-blast
 *     every lead who's already past that day.
 *
 * Everyone who gives an email on the builder is subscribed automatically, and
 * the first step can't land until a full 24 hours have really passed — see
 * MIN_HOURS_BEFORE_FIRST.
 */

export interface AutomationStep {
  id: string;
  dayOffset: number;
  subject: string;
  body: string;
  enabled: boolean;
  sentCount: number;
}

export interface AutomationState {
  enabled: boolean;
  steps: AutomationStep[];
}

/** Steps + the master switch, for the settings screen. */
export async function getAutomation(): Promise<AutomationState> {
  try {
    const [setting, steps] = await Promise.all([
      systemDb((tx) =>
        tx.platformSetting.findUnique({
          where: { id: "platform" },
          select: { emailAutomationOn: true },
        }),
      ),
      systemDb((tx) =>
        tx.emailAutomationStep.findMany({
          orderBy: { dayOffset: "asc" },
          select: {
            id: true,
            dayOffset: true,
            subject: true,
            body: true,
            enabled: true,
            _count: { select: { sends: true } },
          },
        }),
      ),
    ]);
    return {
      enabled: !!setting?.emailAutomationOn,
      steps: steps.map((s) => ({
        id: s.id,
        dayOffset: s.dayOffset,
        subject: s.subject,
        body: s.body,
        enabled: s.enabled,
        sentCount: s._count.sends,
      })),
    };
  } catch {
    return { enabled: false, steps: [] }; // tables not migrated yet
  }
}

export interface AutomationRun {
  enabled: boolean;
  steps: { dayOffset: number; subject: string; due: number; sent: number; failed: number }[];
  sent: number;
  failed: number;
}

/**
 * Send everything that's due right now. Called nightly by the cron, and by the
 * "Run now" button in super-admin.
 *
 * `dryRun` counts who would receive each step without sending or recording
 * anything — that's what the settings screen shows, so the founder can see the
 * sequence is alive before they trust it.
 */
export async function runAutomation(
  opts: { dryRun?: boolean; now?: Date } = {},
): Promise<AutomationRun> {
  const now = opts.now ?? new Date();
  const empty: AutomationRun = { enabled: false, steps: [], sent: 0, failed: 0 };

  let enabled = false;
  let steps: { id: string; dayOffset: number; subject: string; body: string }[];
  try {
    const setting = await systemDb((tx) =>
      tx.platformSetting.findUnique({
        where: { id: "platform" },
        select: { emailAutomationOn: true },
      }),
    );
    enabled = !!setting?.emailAutomationOn;
    steps = await systemDb((tx) =>
      tx.emailAutomationStep.findMany({
        where: { enabled: true },
        orderBy: { dayOffset: "asc" },
        select: { id: true, dayOffset: true, subject: true, body: true },
      }),
    );
  } catch {
    return empty; // tables not migrated yet
  }

  // The switch gates SENDING, not counting — a dry run still reports what
  // would go out, which is how you check a sequence before switching it on.
  if (!enabled && !opts.dryRun) return { ...empty, steps: [] };

  const creds = opts.dryRun ? null : await getEmailCreds();
  if (!opts.dryRun && !creds) return { enabled, steps: [], sent: 0, failed: 0 };

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const report: AutomationRun = { enabled, steps: [], sent: 0, failed: 0 };

  for (const step of steps) {
    const { from, to } = dueRange(step.dayOffset, now);

    // Still an unpaid preview, reachable, not opted out, in the window, and
    // hasn't had this step yet.
    let leads: {
      id: string;
      name: string;
      slug: string;
      status: string;
      buildToken: string | null;
      contactEmail: string | null;
      unsubToken: string | null;
      previewCreatedAt: Date | null;
    }[];
    try {
      // Exclude prior recipients IN THE QUERY, not after it — filtering a
      // capped page in memory would starve later leads once the early ones in
      // the window had all been sent.
      const already = await systemDb((tx) =>
        tx.emailAutomationSend.findMany({
          where: { stepId: step.id },
          select: { restaurantId: true },
        }),
      );
      const sentTo = already.map((a) => a.restaurantId);
      leads = await systemDb((tx) =>
        tx.restaurant.findMany({
          where: {
            builtVia: "diy",
            status: "preview", // activated → the sequence stops for them
            emailOptOut: false,
            contactEmail: { not: null },
            previewCreatedAt: { gte: from, lt: to },
            ...(sentTo.length ? { id: { notIn: sentTo } } : {}),
          },
          orderBy: { previewCreatedAt: "asc" },
          take: 500,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            buildToken: true,
            contactEmail: true,
            unsubToken: true,
            previewCreatedAt: true,
          },
        }),
      );
      // Calendar-day offsets alone would let an 11:50 PM signup receive their
      // first follow-up ten minutes later. The sequence starts after a full
      // day, measured in real hours.
      leads = leads.filter((l) => l.previewCreatedAt && hasWaitedMinimum(l.previewCreatedAt, now));
    } catch {
      continue;
    }

    if (opts.dryRun || leads.length === 0 || !creds) {
      report.steps.push({
        dayOffset: step.dayOffset,
        subject: step.subject,
        due: leads.length,
        sent: 0,
        failed: 0,
      });
      continue;
    }

    // Claim each lead BEFORE sending. If the insert loses a race with a
    // concurrent run, that run owns the send and this one skips it — the
    // unique index is what makes "exactly once" true rather than hopeful.
    const claimed: typeof leads = [];
    for (const lead of leads) {
      try {
        await systemDb((tx) =>
          tx.emailAutomationSend.create({
            data: {
              stepId: step.id,
              restaurantId: lead.id,
              email: lead.contactEmail!,
              status: "sent",
            },
            select: { id: true },
          }),
        );
        claimed.push(lead);
      } catch {
        /* already claimed by another run — skip, don't double-send */
      }
    }

    // Everyone we email needs a working unsubscribe link, so mint one for
    // anyone who hasn't been emailed before.
    const emails: OutgoingEmail[] = [];
    for (const lead of claimed) {
      let token = lead.unsubToken;
      if (!token) {
        token = randomBytes(18).toString("base64url");
        try {
          await systemDb((tx) =>
            tx.restaurant.update({
              where: { id: lead.id },
              data: { unsubToken: token },
              select: { id: true },
            }),
          );
        } catch {
          continue;
        }
      }
      const links = buildRecipientLinks(base, lead);
      const { text, html } = renderEmail(
        step.body,
        { name: lead.name, email: lead.contactEmail!, ...links },
        `${base}/unsubscribe/${token}`,
      );
      emails.push({ to: lead.contactEmail!, subject: step.subject, text, html });
    }

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < emails.length; i += 100) {
      const outcomes = await sendBatch(creds, emails.slice(i, i + 100));
      for (const o of outcomes) {
        if (o.ok) {
          sent++;
        } else {
          failed++;
          // Mark the claim failed so it's visible — but keep the row, so a
          // provider outage doesn't turn into a re-send storm tomorrow.
          try {
            await systemDb((tx) =>
              tx.emailAutomationSend.updateMany({
                where: { stepId: step.id, email: o.to },
                data: { status: "failed", error: o.error?.slice(0, 300) ?? null },
              }),
            );
          } catch {
            /* best-effort */
          }
        }
      }
    }

    report.steps.push({
      dayOffset: step.dayOffset,
      subject: step.subject,
      due: claimed.length,
      sent,
      failed,
    });
    report.sent += sent;
    report.failed += failed;
  }

  return report;
}

export { CATCH_UP_DAYS, MIN_HOURS_BEFORE_FIRST };
