import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";

/**
 * Platform back-office chrome. Every /super-admin page runs in the trusted
 * system context and is gated to the platform super-admin (you). Mirrors the
 * restaurant dashboard's sidebar shell for a consistent, professional feel.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage();
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
