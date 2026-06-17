import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { signOut } from "../login/actions";
import { SuperAdminNav } from "@/components/super-admin/SuperAdminNav";

/**
 * Platform back-office chrome. Every /super-admin page runs in the trusted
 * system context and is gated to the platform super-admin (you).
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage();

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-plum-ink/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/super-admin" className="font-heading text-lg font-bold">
            Servd <span className="text-plum-ink/40">· platform</span>
          </Link>
          <form action={signOut}>
            <button className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-sm font-semibold">
              Sign out
            </button>
          </form>
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <SuperAdminNav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
