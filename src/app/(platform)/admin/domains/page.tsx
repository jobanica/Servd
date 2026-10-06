import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCustomDomainAccess, CUSTOM_DOMAIN_PRICE } from "@/server/billing/addons";
import { getPlanAccess } from "@/server/billing/feature-gate";
import { formatPeso } from "@/lib/money";
import { getDomainProvider } from "@/server/domains";
import { SubdomainForm, CustomDomainForm } from "@/components/admin/DomainForms";
import { DomainInstructions } from "@/components/admin/DomainInstructions";
import { UnlockCustomDomainButton } from "@/components/admin/UnlockCustomDomainButton";
import { refreshDomainStatus, removeCustomDomain } from "@/server/domains/actions";
import { WebAddressForm } from "@/components/admin/WebAddressForm";

export default async function DomainsPage() {
  const { restaurantId } = await requireAdminPage();
  const [restaurant, access, plan] = await Promise.all([
    tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: { slug: true, subdomain: true, customDomain: true, customDomainVerifiedAt: true },
      }),
    ),
    getCustomDomainAccess(restaurantId),
    getPlanAccess(restaurantId),
  ]);
  const priceLabel = formatPeso(CUSTOM_DOMAIN_PRICE);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "servd.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.servdph.com";

  // Live DNS/verification records for a connected (unverified) domain.
  let verification: { type: string; domain: string; value: string }[] = [];
  if (restaurant.customDomain && !restaurant.customDomainVerifiedAt) {
    const status = await getDomainProvider()?.getStatus(restaurant.customDomain);
    verification = status?.verification ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Web address &amp; domain</h1>
      </div>

      {/* Above the paywall on purpose. Correcting a typo the shop has been stuck
          with since signup is not a premium feature, and charging ₱500 to fix
          "mango-gril" would be indefensible. */}
      <WebAddressForm current={restaurant.slug} appUrl={appUrl} />

      {!access.allowed && plan.allAccess ? (
        // All Access includes custom domains, but — like every plan — not
        // during the free trial: a domain provisions real infrastructure. The
        // one-time unlock beside it would be refused (it's already in their
        // plan), so they're sent to the one thing that does open it.
        <div className="rounded-tile border border-plum-ink/10 bg-white p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🔒</span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold text-plum-ink">
                Custom domain — included in All Access
              </h2>
              <p className="mt-1 text-sm text-plum-ink/70">
                Run your ordering site on your own web address (e.g.{" "}
                <span className="font-semibold text-plum-ink">order.yourrestaurant.com</span>). It
                switches on with your first monthly payment — your free trial covers everything
                else in the meantime.
              </p>
              <Link
                href="/admin/billing"
                className="mt-3 inline-block rounded-full px-5 py-2.5 text-sm font-semibold btn-brand"
              >
                Go to billing →
              </Link>
            </div>
          </div>
        </div>
      ) : !access.allowed ? (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🔒</span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-bold text-plum-ink">Custom domain is locked</h2>
              <p className="mt-1 text-sm text-plum-ink/70">
                Run your ordering site on your own web address (e.g.{" "}
                <span className="font-semibold text-plum-ink">order.yourrestaurant.com</span>) instead of a
                Servd link.
              </p>

              {/* The one way in for an account on the older pricing. There used
                  to be a second card here — "or included in Growth" — but
                  Growth is no longer sold, so it pointed at a plan nobody can
                  buy. */}
              <div className="mt-4 grid max-w-sm gap-3">
                <div className="rounded-lg border border-brand-primary/40 bg-cream/40 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/45">One-time</p>
                  <p className="font-heading text-2xl font-extrabold text-plum-ink">{priceLabel}</p>
                  <p className="mt-1 text-xs text-plum-ink/60">
                    Pay once and keep custom domains on this account — no monthly upgrade needed.
                  </p>
                  <div className="mt-3">
                    <UnlockCustomDomainButton price={priceLabel} pending={access.pending} />
                  </div>
                  {access.pending && (
                    <p className="mt-2 text-xs text-plum-ink/50">
                      A checkout was already started. If you&apos;ve paid, it unlocks here within a minute.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <SubdomainForm current={restaurant.subdomain ?? ""} rootDomain={rootDomain} />
          <CustomDomainForm current={restaurant.customDomain ?? ""} />

          <DomainInstructions
            domain={restaurant.customDomain ?? null}
            verified={!!restaurant.customDomainVerifiedAt}
            records={verification}
          />

          {restaurant.customDomain && (
            <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold">{restaurant.customDomain}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    restaurant.customDomainVerifiedAt
                      ? "bg-mango/15 text-mango"
                      : "bg-muted/20 text-muted"
                  }`}
                >
                  {restaurant.customDomainVerifiedAt ? "Verified · SSL active" : "Pending DNS"}
                </span>
              </div>

              <div className="mt-4 flex gap-2">
                <form action={refreshDomainStatus}>
                  <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
                    Refresh status
                  </button>
                </form>
                <form action={removeCustomDomain}>
                  <button className="text-xs text-muted hover:text-guava">Disconnect</button>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
