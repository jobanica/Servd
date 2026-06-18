import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getMenu } from "@/server/menu/queries";
import { formatPeso } from "@/lib/money";
import { AddCategoryForm } from "@/components/admin/AddCategoryForm";
import { AddItemForm } from "@/components/admin/AddItemForm";
import { ImportMenuButton } from "@/components/admin/ImportMenuButton";
import {
  deleteCategory,
  deleteItem,
  toggleItemAvailability,
} from "@/server/menu/actions";

// AI menu import calls a vision model, which can take longer than the default
// serverless timeout — give the Server Action room to finish.
export const maxDuration = 60;

export default async function MenuPage() {
  const { restaurantId } = await requireAdminPage();
  const categories = await getMenu(restaurantId);
  const aiImportEnabled = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-plum-ink/50">
            ← Dashboard
          </Link>
          <h1 className="font-heading text-2xl font-bold">Menu</h1>
        </div>
        <div className="flex items-center gap-3">
          {aiImportEnabled && <ImportMenuButton />}
          <Link
            href="/admin/modifiers"
            className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
          >
            Modifier groups →
          </Link>
        </div>
      </div>

      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <AddCategoryForm />
      </div>

      {categories.length === 0 && (
        <p className="text-sm text-plum-ink/50">
          No categories yet. Add one above to start building your menu.
        </p>
      )}

      {categories.map((category) => (
        <section
          key={category.id}
          className="rounded-tile border border-plum-ink/10 bg-white p-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold">{category.name}</h2>
            <form action={deleteCategory}>
              <input type="hidden" name="id" value={category.id} />
              <button className="text-xs text-muted hover:text-guava">
                Delete category
              </button>
            </form>
          </div>

          <ul className="mt-3 divide-y divide-plum-ink/5">
            {category.menuItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 py-3"
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-cream" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    {!item.isAvailable && (
                      <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs text-muted">
                        Out of stock
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="truncate text-sm text-plum-ink/50">
                      {item.description}
                    </p>
                  )}
                </div>
                <span className="font-semibold">{formatPeso(item.price)}</span>

                {/* Out-of-stock toggle */}
                <form action={toggleItemAvailability}>
                  <input type="hidden" name="id" value={item.id} />
                  <input
                    type="hidden"
                    name="available"
                    value={(!item.isAvailable).toString()}
                  />
                  <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                    {item.isAvailable ? "Mark out" : "Mark in"}
                  </button>
                </form>

                <Link
                  href={`/admin/menu/${item.id}`}
                  className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold"
                >
                  Edit
                </Link>

                <form action={deleteItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="text-xs text-muted hover:text-guava">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>

          <div className="mt-3">
            <AddItemForm categoryId={category.id} />
          </div>
        </section>
      ))}
    </div>
  );
}
