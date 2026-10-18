import { signOut } from "@/app/(platform)/login/actions";
import type { AppLoginPath } from "@/lib/pwa/app-login";

/** Shown to non-admin staff when their restaurant's subscription is suspended. */
export function SuspendedNotice({ loginPath }: { loginPath: AppLoginPath }) {
  return (
    <div className="mx-auto max-w-md pt-16 text-center">
      <h1 className="font-heading text-2xl font-bold">Service paused</h1>
      <p className="mt-2 text-sm text-plum-ink/60">
        This restaurant&apos;s Servd subscription is on hold. Please ask the
        owner/admin to update billing to restore access.
      </p>
      <form action={signOut} className="mt-6">
        <input type="hidden" name="to" value={loginPath} />
        <button className="rounded-full border border-plum-ink/15 px-5 py-2 text-sm font-semibold">
          Sign out
        </button>
      </form>
    </div>
  );
}
