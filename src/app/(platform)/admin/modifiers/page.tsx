import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getModifierGroups } from "@/server/menu/queries";
import { formatDelta } from "@/lib/money";
import { AddModifierGroupForm } from "@/components/admin/AddModifierGroupForm";
import { AddModifierForm } from "@/components/admin/AddModifierForm";
import { deleteModifier, deleteModifierGroup } from "@/server/menu/actions";

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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg font-bold">{group.name}</h2>
              <p className="text-xs text-plum-ink/50">
                {group.required ? "Required" : "Optional"} · select{" "}
                {group.minSelect}–{group.maxSelect}{" "}
                {group.maxSelect === 1 ? "(single)" : "(multi)"}
              </p>
            </div>
            <form action={deleteModifierGroup}>
              <input type="hidden" name="id" value={group.id} />
              <button className="text-xs text-muted hover:text-guava">
                Delete group
              </button>
            </form>
          </div>

          <ul className="mt-3 space-y-1">
            {group.modifiers.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg bg-cream/60 px-3 py-1.5 text-sm"
              >
                <span>
                  {m.name}{" "}
                  <span className="text-brand-primary">
                    {formatDelta(m.priceDelta)}
                  </span>
                </span>
                <form action={deleteModifier}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="text-xs text-muted hover:text-guava">
                    Remove
                  </button>
                </form>
              </li>
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
