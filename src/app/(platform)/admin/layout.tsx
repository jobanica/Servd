import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getEntitledFeatures } from "@/server/billing/feature-gate";
import { hasTutorials } from "@/server/tutorials/tutorials";
import { AdminShell } from "@/components/admin/AdminShell";
import { listBranches } from "@/server/tenancy/branches";

/**
 * Dashboard chrome for the restaurant back-office. Wraps every /admin page in
 * the sidebar shell. If the visitor isn't an admin/manager, we render the page
 * bare and let its own guard handle the redirect to /login.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    return <>{children}</>;
  }

  const [restaurant, features, tutorialsReady] = await Promise.all([
    tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: {
          name: true,
          displayName: true,
          slug: true,
          status: true,
          logoUrl: true,
          brandPrimaryColor: true,
          brandAccentColor: true,
        },
      }),
    ),
    getEntitledFeatures(user.restaurantId),
    hasTutorials(),
  ]);
  // Only an owner with more than one shop sees a switcher; for everyone else
  // this is one cheap query that resolves to a single row.
  const branches = await listBranches(user.authUserId, user.restaurantId);

  return (
    <AdminShell
      brand={{
        name: restaurant.displayName || restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
        logoUrl: restaurant.logoUrl,
      }}
      theme={{
        brandPrimaryColor: restaurant.brandPrimaryColor,
        brandAccentColor: restaurant.brandAccentColor,
      }}
      // Full white-label (no "Powered by Servd") is now a per-plan feature.
      fullWhiteLabel={features.has("whiteLabel")}
      features={[...features]}
      showTutorials={tutorialsReady}
      branches={branches}
    >
      {children}
    </AdminShell>
  );
}
