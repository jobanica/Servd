import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getTables, getRestaurantBrief } from "@/server/tables/queries";
import { restaurantOrderUrl } from "@/lib/qr";
import { AddTableForm } from "@/components/admin/AddTableForm";
import { deleteTable, regenerateQrToken } from "@/server/tables/actions";

export default async function TablesPage() {
  const { restaurantId } = await requireAdminPage();
  const [tables, restaurant] = await Promise.all([
    getTables(restaurantId),
    getRestaurantBrief(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">
            ← Dashboard
          </Link>
          <h1 className="font-heading text-2xl font-bold">Tables</h1>
          <p className="text-sm text-plum-ink/50">
            Each table has a unique QR that drops the diner straight onto its
            menu.
          </p>
        </div>
        {tables.length > 0 && (
          <Link
            href="/admin/tables/print"
            className="rounded-full px-5 py-2 text-sm font-semibold btn-brand"
          >
            Printable QR sheet →
          </Link>
        )}
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <AddTableForm />
      </div>

      {tables.length === 0 ? (
        <p className="text-sm text-plum-ink/50">
          No tables yet. Add one above, then print its QR.
        </p>
      ) : (
        <ul className="space-y-2">
          {tables.map((table) => (
            <li
              key={table.id}
              className="flex items-center gap-3 rounded-tile border border-plum-ink/10 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <span className="font-heading font-bold">
                  Table {table.tableNumber}
                </span>
                <p className="truncate text-xs text-plum-ink/40">
                  {restaurantOrderUrl(
                    {
                      slug: restaurant.slug,
                      subdomain: restaurant.subdomain,
                      customDomain: restaurant.customDomain,
                      customDomainVerified: !!restaurant.customDomainVerifiedAt,
                    },
                    table.qrToken,
                  )}
                </p>
              </div>
              <form action={regenerateQrToken}>
                <input type="hidden" name="id" value={table.id} />
                <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                  Regenerate QR
                </button>
              </form>
              <form action={deleteTable}>
                <input type="hidden" name="id" value={table.id} />
                <button className="text-xs text-muted hover:text-guava">
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
