import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getItem, getCategories, getModifierGroups } from "@/server/menu/queries";
import { formatDelta } from "@/lib/money";
import { EditItemForm } from "@/components/admin/EditItemForm";
import { setItemModifierGroup } from "@/server/menu/actions";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { restaurantId } = await requireAdminPage();

  const [item, categories, allGroups] = await Promise.all([
    getItem(restaurantId, itemId),
    getCategories(restaurantId),
    getModifierGroups(restaurantId),
  ]);
  if (!item) notFound();

  const attachedIds = new Set(item.modifierGroups.map((g) => g.modifierGroupId));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/menu" className="text-sm text-plum-ink/50">
          ← Menu
        </Link>
        <h1 className="font-heading text-2xl font-bold">{item.name}</h1>
      </div>

      <EditItemForm
        item={{
          id: item.id,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description,
          price: item.price,
          isAvailable: item.isAvailable,
          imageUrl: item.imageUrl,
          videoUrl: item.videoUrl,
        }}
        categories={categories}
      />

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Modifier groups</h2>
        <p className="text-sm text-plum-ink/50">
          Choose which option sets apply to this item.{" "}
          <Link href="/admin/modifiers" className="text-brand-primary">
            Manage groups
          </Link>
        </p>

        {allGroups.length === 0 && (
          <p className="mt-3 text-sm text-plum-ink/50">
            No modifier groups exist yet.
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {allGroups.map((group) => {
            const attached = attachedIds.has(group.id);
            return (
              <li
                key={group.id}
                className="flex items-center justify-between rounded-lg bg-cream/60 px-3 py-2"
              >
                <div>
                  <span className="font-medium">{group.name}</span>
                  <span className="ml-2 text-xs text-plum-ink/50">
                    {group.modifiers
                      .map((m) => `${m.name}${formatDelta(m.priceDelta)}`)
                      .join(", ") || "no options yet"}
                  </span>
                </div>
                <form action={setItemModifierGroup}>
                  <input type="hidden" name="menuItemId" value={item.id} />
                  <input type="hidden" name="modifierGroupId" value={group.id} />
                  <input
                    type="hidden"
                    name="attach"
                    value={(!attached).toString()}
                  />
                  <button
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      attached
                        ? "border border-plum-ink/15"
                        : "btn-brand text-white"
                    }`}
                  >
                    {attached ? "Remove" : "Attach"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
