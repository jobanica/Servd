import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getModifierGroups } from "@/server/menu/queries";
import { AddModifierGroupForm } from "@/components/admin/AddModifierGroupForm";
import { AddModifierForm } from "@/components/admin/AddModifierForm";
import { ModifierRow } from "@/components/admin/ModifierRow";
import { ModifierGroupHeader } from "@/components/admin/ModifierGroupHeader";

export default async function ModifiersPage() {
  const { restaurantId } = await requireAdminPage();
  const groups = await getModifierGroups(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/menu" className="text-sm text-plum-ink/50">
          ← Menu
        </Link>
        <h1 className="font-heading text-2xl font-bold">Modifier groups</h1>
        <p className="text-sm text-plum-ink/50">
          Reusable option sets (Size, Add-ons…) you can attach to menu items.
        </p>
      </div>

      <AddModifierGroupForm />

      {groups.length === 0 && (
        <p className="text-sm text-plum-ink/50">No modifier groups yet.</p>
      )}

      {groups.map((group) => (
        <section
          key={group.id}
          className="rounded-tile border border-plum-ink/10 bg-white p-4"
        >
          <ModifierGroupHeader
            group={{ id: group.id, name: group.name, required: group.required, minSelect: group.minSelect, maxSelect: group.maxSelect }}
          />

          <ul className="mt-3 space-y-1">
            {group.modifiers.map((m) => (
              <ModifierRow key={m.id} id={m.id} name={m.name} priceDelta={m.priceDelta} />
            ))}
          </ul>

          <div className="mt-3">
            <AddModifierForm groupId={group.id} />
          </div>
        </section>
      ))}
    </div>
  );
}
