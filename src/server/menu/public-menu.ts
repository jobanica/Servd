import { systemDb } from "@/server/tenancy/scoped-db";
import type { DinerCategory } from "@/lib/cart/types";
import { effectivePrice } from "@/lib/pricing/happy-hour";
import { getActiveHappyHours } from "@/server/pricing/happy-hour";
import { getServingStates } from "@/server/menu/servings";
import { getDishStock } from "@/server/inventory/dish-stock";
import { getVariantsMap } from "@/server/menu/variants";
import { getUnavailableModifierIds } from "@/server/menu/modifier-availability";
import { getPosOnlyItemIds } from "@/server/menu/pos-only";

/**
 * Loads a restaurant's full menu for the diner page, by restaurantId. Returns
 * categories → items → modifier groups → options, as plain serializable data.
 *
 * Runs in the trusted system context (diners have no session) but the query is
 * tightly scoped to ONE restaurantId, and includes only diner-relevant fields.
 * Out-of-stock items are returned too (the UI shows them disabled).
 *
 * Counter-only items are left out unless `includePosOnly` is set, which only
 * the cashier's own POS does. They're dropped entirely rather than returned
 * disabled: a diner shouldn't see that a ₱30 takeaway box or a staff meal
 * exists at all. Hiding them here is presentation — the order builder refuses
 * them independently, so a crafted request can't order what the page won't show.
 */
export async function getPublicMenu(
  restaurantId: string,
  locale = "en",
  opts: { includePosOnly?: boolean } = {},
): Promise<DinerCategory[]> {
  const categories = await systemDb((tx) =>
    tx.category.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        translations: { where: { locale } },
        menuItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            translations: { where: { locale } },
            modifierGroups: {
              orderBy: { sortOrder: "asc" },
              include: {
                group: {
                  // Explicit columns: `isAvailable` on a modifier arrives in a
                  // manual migration, and a wide include would break the whole
                  // menu on a database that hasn't run it yet. It's layered on
                  // below from a best-effort query instead.
                  include: {
                    modifiers: {
                      orderBy: { sortOrder: "asc" },
                      select: { id: true, name: true, priceDelta: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  );

  // Active happy-hour rules → discounted display price (struck-through original).
  const happyHours = await getActiveHappyHours(restaurantId);

  // Daily servings caps — an item that's hit its cap shows as sold out for today.
  const itemIds = categories.flatMap((c) => c.menuItems.map((i) => i.id));
  const servings = await getServingStates(restaurantId, itemIds);
  // Sizes/variants per item (best-effort).
  const variantsMap = await getVariantsMap(itemIds);
  // Add-ons the kitchen marked out — shown disabled rather than hidden, so the
  // diner can see the option exists and is just unavailable right now.
  const modsOut = await getUnavailableModifierIds(restaurantId);
  // Counted stock — a recipe's ingredients or a product's own units. Shown sold
  // out as soon as the last portion is spoken for, not when it's finally
  // cooked: otherwise the shelf reads as full to everyone who loads the page
  // while orders are already in the kitchen.
  const dishStock = await getDishStock(restaurantId, itemIds);

  // Counter-only items — hidden from every diner-facing surface.
  const posOnly = opts.includePosOnly ? new Set<string>() : await getPosOnlyItemIds(restaurantId);

  // A category emptied entirely by that filter goes with it — a "Staff meals"
  // heading with nothing under it advertises the hidden menu it's meant to hide.
  const visible = categories.filter(
    (c) => c.menuItems.length === 0 || c.menuItems.some((i) => !posOnly.has(i.id)),
  );

  // Overlay the requested locale's translations, falling back to base text.
  return visible.map((c) => ({
    id: c.id,
    name: c.translations[0]?.name ?? c.name,
    items: c.menuItems.filter((i) => !posOnly.has(i.id)).map((item) => {
      const eff = effectivePrice(item.price, { id: item.id, categoryId: item.categoryId }, happyHours);
      // Out of daily servings → sold out for the rest of today.
      const cap = servings.get(item.id);
      const cappedOut = cap?.remaining != null && cap.remaining <= 0;
      // Nothing left to make it from (or all of it promised to open orders).
      const stockOut = dishStock.get(item.id)?.soldOut === true;
      // Sizes/variants: each priced through happy-hour like the base price.
      const rawVariants = variantsMap.get(item.id) ?? [];
      const variants = rawVariants.map((v) => ({
        id: v.id,
        name: v.name,
        price: effectivePrice(v.price, { id: item.id, categoryId: item.categoryId }, happyHours).price,
        stock: v.stock,
      }));
      // For variant items, the card shows the lowest size as the "from" price.
      const fromPrice = variants.length > 0 ? Math.min(...variants.map((v) => v.price)) : eff.price;
      // If every size is out of stock, the whole item is sold out.
      const allSizesOut = variants.length > 0 && variants.every((v) => v.stock != null && v.stock <= 0);
      return {
      id: item.id,
      name: item.translations[0]?.name ?? item.name,
      description: item.translations[0]?.description ?? item.description,
      price: fromPrice,
      originalPrice: eff.discount > 0 && variants.length === 0 ? eff.originalPrice : null,
      ...(variants.length > 0 ? { variants } : {}),
      imageUrl: item.imageUrl,
      videoUrl: item.videoUrl,
      videoPosterUrl: item.videoPosterUrl,
      isAvailable: item.isAvailable && !cappedOut && !allSizesOut && !stockOut,
      dietaryTags: item.dietaryTags ?? [],
      groups: item.modifierGroups.map((link) => ({
        id: link.group.id,
        name: link.group.name,
        required: link.group.required,
        minSelect: link.group.minSelect,
        maxSelect: link.group.maxSelect,
        modifiers: link.group.modifiers.map((m) => ({
          id: m.id,
          name: m.name,
          priceDelta: m.priceDelta,
          isAvailable: !modsOut.has(m.id),
        })),
      })),
      };
    }),
  }));
}
