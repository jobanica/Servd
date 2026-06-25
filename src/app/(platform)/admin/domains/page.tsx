import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { hasModule } from "@/server/billing/entitlements";
import { getDomainProvider } from "@/server/domains";
import { SubdomainForm, CustomDomainForm } from "@/components/admin/DomainForms";
import { DomainInstructions } from "@/components/admin/DomainInstructions";
import { refreshDomainStatus, removeCustomDomain } from "@/server/domains/actions";

export default async function DomainsPage() {
  const { restaurantId } = await requireAdminPage();
  const [restaurant, eligible] = await Promise.all([
    tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: { subdomain: true, customDomain: true, customDomainVerifiedAt: true },
      }),
    ),
    hasModule(restaurantId, "custom_domain"),
  ]);

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "servd.app";

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
        <h1 className="font-heading text-2xl font-bold">Custom domain</h1>
      </div>

      {!eligible ? (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="text-sm text-plum-ink/70">
            Custom subdomains and domains are a premium feature.{" "}
            <Link href="/admin/billing" className="font-semibold text-brand-primary">
              Upgrade your plan
            </Link>{" "}
            to enable them.
          </p>
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
