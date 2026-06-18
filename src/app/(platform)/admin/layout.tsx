import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getEntitledFeatures } from "@/server/billing/feature-gate";
import { AdminShell } from "@/components/admin/AdminShell";

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

  const [restaurant, features] = await Promise.all([
    tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({
        select: { name: true, displayName: true, slug: true, status: true },
      }),
    ),
    getEntitledFeatures(user.restaurantId),
  ]);

  return (
    <AdminShell
      brand={{
        name: restaurant.displayName || restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
      }}
      features={[...features]}
    >
      {children}
    </AdminShell>
  );
}
