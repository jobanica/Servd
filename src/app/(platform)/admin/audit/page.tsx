import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getAuditLogs } from "@/server/audit/log";
import { manilaDateTime } from "@/lib/time/manila";

const ACTION_LABEL: Record<string, string> = {
  "order.void": "Voided order",
  "order.item_void": "Removed item",
  "table.status": "Table status",
  "giftcard.redeem": "Gift card redeemed",
};

function summary(v: unknown): string {
  if (v == null) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "auditLog", "Audit log");
  if (locked) return locked;
  const sp = await searchParams;
  const rows = await getAuditLogs(restaurantId, { action: sp.action || undefined });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-plum-ink/50">
          Every sensitive change — voids, item edits, table-status and gift-card redemptions —
          with who did it, when, and the before/after.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["All", ""],
          ["Voids", "order.void"],
          ["Item edits", "order.item_void"],
          ["Gift cards", "giftcard.redeem"],
          ["Tables", "table.status"],
        ].map(([label, action]) => (
          <Link
            key={label}
            href={action ? `/admin/audit?action=${action}` : "/admin/audit"}
            className={`rounded-full px-3 py-1.5 font-semibold ${
              (sp.action ?? "") === action ? "bg-brand-primary text-white" : "bg-white ring-1 ring-plum-ink/10 text-plum-ink/70"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-plum-ink/45">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-plum-ink/5">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-plum-ink/50">No audit entries yet.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-plum-ink/60">
                    {manilaDateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">{r.actorEmail ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="px-4 py-2.5 text-plum-ink/70">{r.reason ?? "—"}</td>
                  <td className="px-4 py-2.5 max-w-sm truncate font-mono text-xs text-plum-ink/45" title={`${summary(r.before)} → ${summary(r.after)}`}>
                    {summary(r.before)} {r.before ? "→ " : ""}{summary(r.after)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
