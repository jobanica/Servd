import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { signOut } from "../login/actions";

/**
 * Restaurant owner/admin home. Demonstrates the full isolation path:
 *   session → restaurantId (trusted) → tenantDb(restaurantId) → RLS-scoped read.
 * This admin can only ever load THEIR OWN restaurant.
 */
export default async function AdminHome() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    redirect("/login");
  }

  const restaurant = await tenantDb(user.restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow(),
  );

  // Non-payment: send the owner to billing to resolve it.
  if (restaurant.status === "suspended") {
    redirect("/admin/billing");
  }
  // First-run: guide new owners through the onboarding wizard (skippable).
  if (!restaurant.onboardingCompletedAt) {
    redirect("/admin/onboarding");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            {restaurant.displayName || restaurant.name}
          </h1>
          <p className="text-sm text-plum-ink/60">
            /{restaurant.slug} · {restaurant.status}
          </p>
        </div>
        <form action={signOut}>
          <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["Menu", "/admin/menu", "Categories, items & add-ons", true],
            ["Tables", "/admin/tables", "Printable QR per table", true],
            ["Modifiers", "/admin/modifiers", "Reusable option sets", true],
            ["Online payment", "/admin/payments", "Connect PayMongo (GCash & card)", true],
            ["Printing", "/admin/printing", "Kitchen ticket printer setup", true],
            ["Branding", "/admin/branding", "Logo, colors & display name", false],
            ["Staff", "/admin/staff", "Kitchen, cashier & admin logins", false],
            ["Feedback", "/admin/feedback", "Ratings & comments inbox", true],
            ["SMS marketing", "/admin/sms", "Promos to opted-in customers", true],
            ["Billing", "/admin/billing", "Plan, trial & invoices", true],
          ] as const
        ).map(([title, href, body, ready]) => {
          const card = (
            <div className="h-full rounded-tile border border-plum-ink/10 bg-white p-5">
              <h3 className="font-heading font-bold">{title}</h3>
              <p className="mt-1 text-sm text-plum-ink/60">{body}</p>
              {!ready && (
                <p className="mt-3 text-xs text-muted">Coming soon</p>
              )}
            </div>
          );
          return ready ? (
            <a key={title} href={href} className="block transition hover:opacity-90">
              {card}
            </a>
          ) : (
            <div key={title} className="opacity-70">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
