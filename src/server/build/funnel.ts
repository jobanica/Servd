import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaStartOfDaysAgo } from "@/lib/time/manila";
import {
  rollupFunnel,
  totalFunnel,
  emptyFunnelDay,
  type FunnelDay,
} from "@/lib/build/funnel-rollup";

/**
 * DIY funnel counts. The whole point of the self-serve path is that it can be
 * measured against the manual one — you only move ad spend across once you can
 * see where it leaks, so every stage is counted separately, per Manila day.
 *
 *   started → reached preview → activation requested → activated
 */

export type { FunnelDay };

export interface FunnelSummary {
  days: FunnelDay[];
  totals: FunnelDay;
  /** Warm leads: built something, never paid. The manual follow-up list. */
  openLeads: {
    id: string;
    name: string;
    slug: string;
    contactEmail: string | null;
    contactPhone: string | null;
    contactFb: string | null;
    items: number;
    reachedPreview: boolean;
    requested: boolean;
    createdAt: string;
  }[];
  /** How the two intake paths compare over the window. */
  manualAccounts: number;
  diyAccounts: number;
  /**
   * Paid DIY accounts whose owner hasn't set a password yet. The claim link is
   * only shown to the browser that built the preview, so if they paid on a
   * different device this is where the founder picks it up to send over.
   */
  unclaimed: { name: string; username: string | null; claimUrl: string }[];
}

export async function getFunnel(days = 14): Promise<FunnelSummary> {
  const from = manilaStartOfDaysAgo(days - 1);
  const empty: FunnelSummary = {
    days: [],
    totals: emptyFunnelDay("total"),
    openLeads: [],
    manualAccounts: 0,
    diyAccounts: 0,
    unclaimed: [],
  };

  try {
    const builds = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: { builtVia: "diy", previewCreatedAt: { gte: from } },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          contactEmail: true,
          contactPhone: true,
          contactFb: true,
          previewCreatedAt: true,
          previewReachedAt: true,
          activationRequestedAt: true,
          _count: { select: { menuItems: true } },
          activationRequests: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, activatedAt: true },
          },
        },
        orderBy: { previewCreatedAt: "desc" },
      }),
    );

    const list = rollupFunnel(
      builds.map((b) => ({
        previewCreatedAt: b.previewCreatedAt,
        previewReachedAt: b.previewReachedAt,
        activationRequestedAt: b.activationRequestedAt,
        activatedAt: b.activationRequests[0]?.activatedAt ?? null,
      })),
      from,
      days,
    );
    const totals = totalFunnel(list);

    const openLeads = builds
      .filter((b) => b.status === "preview" || b.status === "archived")
      .slice(0, 100)
      .map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        contactEmail: b.contactEmail,
        contactPhone: b.contactPhone,
        contactFb: b.contactFb,
        items: b._count.menuItems,
        reachedPreview: !!b.previewReachedAt,
        requested: !!b.activationRequestedAt,
        createdAt: (b.previewCreatedAt ?? new Date()).toISOString(),
      }));

    const [manualAccounts, diyAccounts] = await Promise.all([
      systemDb((tx) =>
        tx.restaurant.count({ where: { status: "active", builtVia: "manual", createdAt: { gte: from } } }),
      ),
      systemDb((tx) =>
        tx.restaurant.count({ where: { status: "active", builtVia: "diy", createdAt: { gte: from } } }),
      ),
    ]);

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const unclaimedRows = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: { builtVia: "diy", status: "active", claimToken: { not: null }, claimedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          name: true,
          claimToken: true,
          staff: { where: { role: "admin" }, take: 1, select: { username: true } },
        },
      }),
    );
    const unclaimed = unclaimedRows.map((r) => ({
      name: r.name,
      username: r.staff[0]?.username ?? null,
      claimUrl: `${base}/claim/${r.claimToken}`,
    }));

    return { days: list, totals, openLeads, manualAccounts, diyAccounts, unclaimed };
  } catch {
    return empty; // builder columns not migrated yet
  }
}
