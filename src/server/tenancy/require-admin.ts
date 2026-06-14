import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";

/**
 * Page guard: returns the logged-in restaurant admin, or redirects to /login.
 * Use at the top of admin pages (Server Components).
 */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || user.role !== "admin") {
    redirect("/login");
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
