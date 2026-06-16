import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getPromotions } from "@/server/promotions/queries";
import { createPromotion, deletePromotion, togglePromotion } from "@/server/promotions/actions";

export default async function PromotionsPage() {
  const { restaurantId } = await requireAdminPage();
  const promotions = await getPromotions(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Promotions</h1>
        <p className="text-sm text-plum-ink/50">
          These show up in your customers&apos; app under the <strong>Promos</strong> tab.
        </p>
      </div>

      {/* Add */}
      <form
        action={createPromotion}
        className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4"
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-plum-ink/50">
            Title
          </label>
          <input
            name="title"
            required
            maxLength={80}
            placeholder="e.g. 20% off every Tuesday"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-plum-ink/50">
            Details (optional)
          </label>
          <textarea
            name="description"
            rows={2}
            maxLength={300}
            placeholder="Dine-in only. Cannot be combined with other offers."
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">
          Add promotion
        </button>
      </form>

      {/* List */}
      {promotions.length === 0 ? (
        <p className="text-sm text-plum-ink/50">No promotions yet. Add one above.</p>
      ) : (
        <ul className="space-y-2">
          {promotions.map((p) => (
            <li
              key={p.id}
              className="flex items-start gap-3 rounded-tile border border-plum-ink/10 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold">{p.title}</span>
                  {!p.active && (
                    <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-xs font-semibold text-plum-ink/50">
                      Hidden
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="mt-0.5 text-sm text-plum-ink/55">{p.description}</p>
                )}
              </div>
              <form action={togglePromotion}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={String(p.active)} />
                <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                  {p.active ? "Hide" : "Show"}
                </button>
              </form>
              <form action={deletePromotion}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs text-muted hover:text-guava">Delete</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
