import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { hasModule } from "@/server/billing/entitlements";
import { listInventory, listSuppliers, getInventoryReport } from "@/server/inventory/queries";
import { formatPeso } from "@/lib/money";
import { AddInventoryItemForm } from "@/components/admin/inventory/AddInventoryItemForm";
import { AddSupplierForm } from "@/components/admin/inventory/AddSupplierForm";
import {
  deleteInventoryItem,
  recordWaste,
  recordCount,
  deleteSupplier,
  setAutoOutOfStock,
} from "@/server/inventory/actions";

export default async function InventoryPage() {
  const { restaurantId } = await requireAdminPage();
  if (!(await hasModule(restaurantId, "inventory"))) {
    return (
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h1 className="font-heading text-2xl font-bold">Inventory</h1>
        <p className="mt-2 text-sm text-plum-ink/70">
          Inventory is a premium module.{" "}
          <Link href="/admin/billing" className="font-semibold text-brand-primary">Upgrade your plan</Link>{" "}
          to track ingredients, recipes, and stock.
        </p>
      </div>
    );
  }

  const from = new Date();
  from.setDate(from.getDate() - 30);
  const [items, suppliers, report, restaurant] = await Promise.all([
    listInventory(restaurantId),
    listSuppliers(restaurantId),
    getInventoryReport(restaurantId, from, new Date()),
    tenantDb(restaurantId, (tx) => tx.restaurant.findFirstOrThrow({ select: { autoOutOfStock: true } })),
  ]);
  const cogs = report.reduce((s, r) => s + r.cogs, 0);
  const lowCount = items.filter((i) => i.low).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
          <h1 className="font-heading text-2xl font-bold">Inventory</h1>
        </div>
        <Link href="/admin/inventory/po" className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
          Purchase orders →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Ingredients</p>
          <p className="font-heading text-2xl font-extrabold">{items.length}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">Low stock</p>
          <p className="font-heading text-2xl font-extrabold text-guava">{lowCount}</p>
        </div>
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs text-plum-ink/50">COGS (30d)</p>
          <p className="font-heading text-2xl font-extrabold">{formatPeso(Math.round(cogs))}</p>
        </div>
      </div>

      <form action={setAutoOutOfStock} className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoOutOfStock" defaultChecked={restaurant.autoOutOfStock} />
          Auto-mark menu items out of stock when an ingredient hits zero
        </label>
        <button className="mt-2 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Save</button>
      </form>

      <AddInventoryItemForm suppliers={suppliers} />

      {/* Items */}
      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr>
              <th className="p-3">Ingredient</th><th>Stock</th><th>Cost/unit</th><th>Reorder</th>
              <th>Waste</th><th>Count</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={`border-t border-plum-ink/10 ${i.low ? "bg-guava/5" : ""}`}>
                <td className="p-3">
                  {i.name}
                  {i.low && <span className="ml-2 rounded-full bg-guava/15 px-2 py-0.5 text-xs text-guava">low</span>}
                  <span className="block text-xs text-plum-ink/40">{i.supplier?.name ?? "—"} · {i.unit}</span>
                </td>
                <td>{i.stockQty} {i.unit}</td>
                <td>{formatPeso(i.costPerUnit)}</td>
                <td>{i.reorderLevel}</td>
                <td>
                  <form action={recordWaste} className="flex gap-1">
                    <input type="hidden" name="id" value={i.id} />
                    <input name="qty" type="number" step="0.01" min="0" placeholder="0" className="w-16 rounded border border-plum-ink/15 px-1 py-0.5 text-xs" />
                    <button className="text-xs text-muted hover:text-guava">log</button>
                  </form>
                </td>
                <td>
                  <form action={recordCount} className="flex gap-1">
                    <input type="hidden" name="id" value={i.id} />
                    <input name="counted" type="number" step="0.01" min="0" placeholder="actual" className="w-16 rounded border border-plum-ink/15 px-1 py-0.5 text-xs" />
                    <button className="text-xs text-brand-primary">set</button>
                  </form>
                </td>
                <td>
                  <form action={deleteInventoryItem}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-xs text-muted hover:text-guava">delete</button>
                  </form>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="p-3 text-sm text-plum-ink/40">No ingredients yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Suppliers */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h3 className="font-heading font-bold">Suppliers</h3>
        <div className="mt-2"><AddSupplierForm /></div>
        <ul className="mt-3 space-y-1">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span>{s.name}</span>
              <form action={deleteSupplier}>
                <input type="hidden" name="id" value={s.id} />
                <button className="text-xs text-muted hover:text-guava">remove</button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
