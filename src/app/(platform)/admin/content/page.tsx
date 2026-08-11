import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { requireFeaturePage } from "@/server/billing/feature-gate";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getConnectedPlatforms, deleteSocialPost } from "@/server/social/actions";
import { ComposePost } from "@/components/admin/social/ComposePost";
import { platformLabels } from "@/lib/social/platforms";
import { manilaDateTime } from "@/lib/time/manila";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-brand-primary/10 text-brand-primary",
  posted: "bg-mango/15 text-mango",
  failed: "bg-guava/15 text-guava",
};

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  const { restaurantId } = await requireAdminPage();
  await requireFeaturePage(restaurantId, "contentScheduler");
  const { connected: justConnected } = await searchParams;

  const [posts, connected] = await Promise.all([
    tenantDb(restaurantId, (tx) =>
      tx.socialPost.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    ).catch(() => []),
    getConnectedPlatforms(),
  ]);

  const upcoming = posts.filter((p) => p.status === "scheduled");
  const past = posts.filter((p) => p.status !== "scheduled");

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Content scheduler</h1>
        <p className="text-sm text-plum-ink/50">
          Write once and post to your social accounts — now, or scheduled for later.
        </p>
      </div>

      {justConnected && (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm font-semibold text-plum-ink">
          ✓ Accounts connected. Anything you tick below will post to them.
        </div>
      )}

      <ComposePost connected={connected} />

      {upcoming.length > 0 && (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <h2 className="font-heading font-bold">Scheduled ({upcoming.length})</h2>
          <ul className="mt-2 divide-y divide-plum-ink/10">
            {upcoming.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm text-plum-ink">{p.caption}</p>
                  <p className="mt-0.5 text-xs text-plum-ink/50">
                    {p.scheduledFor ? manilaDateTime(p.scheduledFor) : "—"} · {platformLabels(p.platforms)}
                  </p>
                </div>
                <form action={deleteSocialPost}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs font-semibold text-plum-ink/45 hover:text-guava">remove</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h2 className="font-heading font-bold">History</h2>
        {past.length === 0 ? (
          <p className="mt-2 text-sm text-plum-ink/45">Nothing posted yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-plum-ink/10">
            {past.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm text-plum-ink">{p.caption}</p>
                  <p className="mt-0.5 text-xs text-plum-ink/50">
                    {manilaDateTime(p.postedAt ?? p.createdAt)} · {platformLabels(p.platforms)}
                  </p>
                  {p.error && <p className="mt-0.5 text-xs text-guava">{p.error}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[p.status] ?? ""}`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
