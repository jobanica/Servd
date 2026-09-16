import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { hasModule } from "@/server/billing/entitlements";
import type { HrRole } from "@/lib/hr/permissions";

/**
 * HRIS access: owner (admin) or manager, and the plan must include `hris`.
 * Returns { restaurantId, role, eligible } — pages render an upgrade prompt when
 * not eligible rather than redirecting.
 */
export async function requireHrPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    redirect("/login");
  }
  const eligible = await hasModule(user.restaurantId, "hris");
  // staffUserId comes back so a screen can tell "this is your own record" from
  // "this is a colleague's" — the line pay visibility is drawn on.
  return {
    restaurantId: user.restaurantId,
    role: user.role as HrRole,
    staffUserId: user.staffUserId,
    eligible,
  };
}

/** Pages only the owner may open: payroll, and anything that sets pay. */
export async function requireHrOwnerPage() {
  const hr = await requireHrPage();
  if (hr.role !== "admin") redirect("/admin/hr");
  return hr;
}

/** Actions only the owner may run: hiring, payroll, contribution settings. */
export async function requireHrOwnerAction() {
  const user = await requireHrAction();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}

export async function requireHrAction() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    throw new Error("UNAUTHORIZED");
  }
  if (!(await hasModule(user.restaurantId, "hris"))) {
    throw new Error("Your plan doesn't include HRIS. Upgrade to enable it.");
  }
  // Narrowed: the check above already rejects every other role, and callers
  // need to branch on it without re-proving that.
  return { ...user, role: user.role as HrRole };
}
