import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getItem, getCategories, getModifierGroups } from "@/server/menu/queries";
import { getMenuItemCost } from "@/server/menu/cost";
import { formatDelta } from "@/lib/money";
import { EditItemForm } from "@/components/admin/EditItemForm";
import { ItemTranslationForm } from "@/components/admin/ItemTranslationForm";
import { setItemModifierGroup } from "@/server/menu/actions";
import { LOCALES, DEFAULT_LOCALE, LOCALE_LABELS } from "@/i18n/locales";
import { hasModule } from "@/server/billing/entitlements";
import { getRecipe, listInventory } from "@/server/inventory/queries";
import { setRecipeComponent } from "@/server/inventory/actions";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { restaurantId } = await requireAdminPage();

  const [item, categories, allGroups, translations] = await Promise.all([
    getItem(restaurantId, itemId),
    getCategories(restaurantId),
    getModifierGroups(restaurantId),
    tenantDb(restaurantId, (tx) =>
      tx.menuItemTranslation.findMany({ where: { menuItemId: itemId } }),
    ),
  ]);
  if (!item) notFound();

  const foodCost = await getMenuItemCost(restaurantId, itemId);
  const translationByLocale = new Map(translations.map((tr) => [tr.locale, tr]));

  // Recipe (inventory module).
  const inventoryEnabled = await hasModule(restaurantId, "inventory");
  const [recipe, inventoryItems] = inventoryEnabled
    ? await Promise.all([getRecipe(restaurantId, itemId), listInventory(restaurantId)])
    : [[], []];

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
          cost: foodCost,
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

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Translations</h2>
        <p className="text-sm text-plum-ink/50">
          Optional translated name/description per language. Diners see these in
          their chosen language, falling back to the default.
        </p>
        <div className="mt-3 space-y-3">
          {LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((l) => {
            const tr = translationByLocale.get(l);
            return (
              <ItemTranslationForm
                key={l}
                menuItemId={item.id}
                locale={l}
                localeLabel={LOCALE_LABELS[l]}
                initial={{ name: tr?.name ?? "", description: tr?.description ?? "" }}
              />
            );
          })}
        </div>
      </section>

      {inventoryEnabled && (
        <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <h2 className="font-heading text-lg font-bold">Recipe (ingredients)</h2>
          <p className="text-sm text-plum-ink/50">
            Ingredients consumed per one of this item — deducted from stock when an
            order is cooked.
          </p>

          <ul className="mt-3 space-y-1">
            {recipe.map((rc) => (
              <li key={rc.id} className="flex items-center justify-between rounded-lg bg-cream/60 px-3 py-1.5 text-sm">
                <span>{rc.inventoryItem.name} · {rc.quantity} {rc.inventoryItem.unit}</span>
                <form action={setRecipeComponent}>
                  <input type="hidden" name="menuItemId" value={item.id} />
                  <input type="hidden" name="inventoryItemId" value={rc.inventoryItemId} />
                  <input type="hidden" name="quantity" value="0" />
                  <button className="text-xs text-muted hover:text-guava">remove</button>
                </form>
              </li>
            ))}
            {recipe.length === 0 && <li className="text-sm text-plum-ink/40">No ingredients linked.</li>}
          </ul>

          <form action={setRecipeComponent} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="menuItemId" value={item.id} />
            <select name="inventoryItemId" required className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
              <option value="">Ingredient…</option>
              {inventoryItems.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
              ))}
            </select>
            <input name="quantity" type="number" step="0.001" min="0" placeholder="Qty per item" required className="w-32 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            <button className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand">Add</button>
          </form>
        </section>
      )}
    </div>
  );
}
