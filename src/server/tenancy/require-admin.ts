import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Page guard: returns the logged-in restaurant admin, or redirects to /login.
 * Use at the top of admin pages (Server Components).
 *
 * When the restaurant is `suspended` (non-payment), this redirects to the
 * billing page so the owner can pay — unless `allowSuspended` is set (the
 * billing page itself passes that, so they don't get bounced in a loop).
 */
export async function requireAdminPage(opts?: { allowSuspended?: boolean }) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    redirect("/login");
  }
  if (!opts?.allowSuspended) {
    const r = await tenantDb(user.restaurantId, (tx) =>
      tx.restaurant.findFirstOrThrow({ select: { status: true } }),
    );
    if (r.status === "suspended") redirect("/admin/billing");
  }
  return user;
}

/**
 * Action guard: returns the admin, or throws. Server actions catch this and
 * surface a friendly error rather than redirecting mid-submit.
 */
export async function requireAdminAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
