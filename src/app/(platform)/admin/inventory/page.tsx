import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { hasModule } from "@/server/billing/entitlements";
import { listInventory, listSuppliers, getInventoryReport } from "@/server/inventory/queries";
import { formatPeso } from "@/lib/money";
import { AddInventoryItemForm } from "@/components/admin/inventory/AddInventoryItemForm";
import { AddSupplierForm } from "@/components/admin/inventory/AddSupplierForm";
import { InventoryTable } from "@/components/admin/inventory/InventoryTable";
import { deleteSupplier, setAutoOutOfStock, setLowStockAlertPhone } from "@/server/inventory/actions";

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
    tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { autoOutOfStock: true, lowStockAlertPhone: true } }),
    ),
  ]);
  const cogs = report.reduce((s, r) => s + r.cogs, 0);
  const lowItems = items.filter((i) => i.low);
  const stockValue = items.reduce((s, i) => s + i.stockQty * i.costPerUnit, 0);

  const rows = items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    stockQty: i.stockQty,
    costPerUnit: i.costPerUnit,
    reorderLevel: i.reorderLevel,
    low: i.low,
    supplierName: i.supplier?.name ?? null,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
          <h1 className="font-heading text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-plum-ink/50">Track ingredient stock, waste, and cost of goods.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/inventory/reorder" className="rounded-full px-4 py-2 text-sm font-semibold btn-brand">
            🛒 Reorder suggestions →
          </Link>
          <Link href="/admin/inventory/po" className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
            Purchase orders →
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ingredients" value={String(items.length)} />
        <Kpi label="Low stock" value={String(lowItems.length)} tone={lowItems.length > 0 ? "bad" : "ok"} />
        <Kpi label="Stock value" value={formatPeso(Math.round(stockValue))} />
        <Kpi label="COGS (30d)" value={formatPeso(Math.round(cogs))} />
      </div>

      {/* Needs attention — the most important thing on the page. */}
      {lowItems.length > 0 && (
        <div className="rounded-tile border border-guava/30 bg-guava/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading font-bold text-plum-ink">
              ⚠️ {lowItems.length} ingredient{lowItems.length === 1 ? "" : "s"} at or below reorder level
            </p>
            <Link href="/admin/inventory/reorder" className="text-sm font-bold text-brand-primary">
              Review &amp; reorder →
            </Link>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lowItems.slice(0, 12).map((i) => (
              <span key={i.id} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-plum-ink ring-1 ring-guava/25">
                {i.name} · {i.stockQty} {i.unit}
              </span>
            ))}
            {lowItems.length > 12 && (
              <span className="px-1 py-1 text-xs text-plum-ink/50">+{lowItems.length - 12} more</span>
            )}
          </div>
        </div>
      )}

      {/* Ingredients */}
      <InventoryTable items={rows} />

      {/* Tools — collapsed by default so the stock list stays the focus. */}
      <Panel title="➕ Add ingredient" hint="Create a new ingredient to track">
        <AddInventoryItemForm suppliers={suppliers} />
      </Panel>

      <Panel title="🚚 Suppliers" hint={`${suppliers.length} saved`}>
        <AddSupplierForm />
        {suppliers.length > 0 ? (
          <ul className="mt-3 divide-y divide-plum-ink/10">
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-plum-ink">{s.name}</span>
                <form action={deleteSupplier}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-xs font-semibold text-plum-ink/45 hover:text-guava">remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-plum-ink/45">No suppliers yet.</p>
        )}
      </Panel>

      <Panel title="⚙️ Inventory settings" hint="Auto out-of-stock and alerts">
        <form action={setAutoOutOfStock} className="border-b border-plum-ink/10 pb-4">
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input type="checkbox" name="autoOutOfStock" defaultChecked={restaurant.autoOutOfStock} className="mt-0.5" />
            <span>
              Auto-mark menu items out of stock when an ingredient hits zero
              <span className="mt-0.5 block text-xs font-normal text-plum-ink/50">
                Items using that ingredient stop being orderable until it&apos;s restocked.
              </span>
            </span>
          </label>
          <button className="mt-2 rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Save</button>
        </form>

        <form action={setLowStockAlertPhone} className="pt-4">
          <label className="block text-sm font-semibold text-plum-ink">Low-stock SMS alert phone</label>
          <p className="mb-2 text-xs text-plum-ink/50">
            Get a text the moment an ingredient drops to its reorder level (needs SMS configured).
            Leave blank to turn off.
          </p>
          <div className="flex gap-2">
            <input
              name="lowStockAlertPhone"
              defaultValue={restaurant.lowStockAlertPhone ?? ""}
              placeholder="09XX XXX XXXX"
              className="w-56 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />
            <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">Save</button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function Kpi({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="text-xs font-medium text-plum-ink/50">{label}</p>
      <p className={`font-heading text-2xl font-extrabold ${tone === "bad" ? "text-guava" : "text-plum-ink"}`}>
        {value}
      </p>
    </div>
  );
}

/** Collapsible tool section — keeps setup/settings out of the way of daily use. */
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-tile border border-plum-ink/10 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4">
        <span className="font-heading font-bold text-plum-ink">{title}</span>
        <span className="flex items-center gap-2 text-xs text-plum-ink/45">
          {hint}
          <span className="transition group-open:rotate-180" aria-hidden>▾</span>
        </span>
      </summary>
      <div className="border-t border-plum-ink/10 p-4">{children}</div>
    </details>
  );
}
