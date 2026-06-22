import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { hasModule } from "@/server/billing/entitlements";
import { getReorderSuggestions, type ReorderSuggestion } from "@/server/inventory/queries";
import { createPoFromSuggestions } from "@/server/inventory/actions";
import { formatPeso } from "@/lib/money";

export default async function ReorderPage() {
  const { restaurantId } = await requireAdminPage();
  if (!(await hasModule(restaurantId, "inventory"))) {
    return (
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h1 className="font-heading text-2xl font-bold">Reorder suggestions</h1>
        <p className="mt-2 text-sm text-plum-ink/70">
          Inventory is a premium module.{" "}
          <Link href="/admin/billing" className="font-semibold text-brand-primary">Upgrade your plan</Link>.
        </p>
      </div>
    );
  }

  const suggestions = await getReorderSuggestions(restaurantId);

  // Group by supplier.
  const groups = new Map<string, { supplierId: string | null; supplierName: string; rows: ReorderSuggestion[] }>();
  for (const s of suggestions) {
    const key = s.supplierId ?? "—";
    if (!groups.has(key)) groups.set(key, { supplierId: s.supplierId, supplierName: s.supplierName ?? "Unassigned", rows: [] });
    groups.get(key)!.rows.push(s);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/inventory" className="text-sm text-plum-ink/50">← Inventory</Link>
        <h1 className="font-heading text-2xl font-bold">Reorder suggestions</h1>
        <p className="text-sm text-plum-ink/50">
          Suggested quantities from your last 30 days of usage — enough to cover ~2 weeks. Create a
          draft purchase order per supplier in one tap.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-6 text-sm text-plum-ink/50">
          Nothing to reorder right now. Suggestions appear as stock runs down against your usage.
        </p>
      ) : (
        [...groups.values()].map((g) => {
          const total = g.rows.reduce((s, r) => s + r.estCost, 0);
          return (
            <div key={g.supplierId ?? "none"} className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
              <div className="flex items-center justify-between border-b border-plum-ink/10 p-4">
                <div>
                  <h2 className="font-heading font-bold">{g.supplierName}</h2>
                  <p className="text-xs text-plum-ink/45">Est. {formatPeso(total)} · {g.rows.length} items</p>
                </div>
                <form action={createPoFromSuggestions}>
                  <input type="hidden" name="supplierId" value={g.supplierId ?? ""} />
                  <button className="rounded-full px-4 py-2 text-sm font-semibold btn-brand">Create draft PO</button>
                </form>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-plum-ink/45">
                  <tr>
                    <th className="px-4 py-2">Ingredient</th>
                    <th className="px-4 py-2">In stock</th>
                    <th className="px-4 py-2">Avg/day</th>
                    <th className="px-4 py-2">Suggest</th>
                    <th className="px-4 py-2">Est. cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-plum-ink/5">
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-plum-ink/60">
                        {r.stockQty} {r.unit}
                        {r.stockQty <= r.reorderLevel && (
                          <span className="ml-2 rounded-full bg-guava/15 px-2 py-0.5 text-xs text-guava">low</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-plum-ink/60">{r.avgDailyUse} {r.unit}</td>
                      <td className="px-4 py-2.5 font-semibold text-brand-primary">+{r.suggestedQty} {r.unit}</td>
                      <td className="px-4 py-2.5">{formatPeso(r.estCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}
