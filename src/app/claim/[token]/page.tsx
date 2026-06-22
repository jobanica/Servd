import Link from "next/link";
import { getClaimableBusiness } from "@/server/restaurants/claim";
import { ClaimBusinessForm } from "@/components/ClaimBusinessForm";

/**
 * Owner claim page. The super-admin creates a business by name and hands the
 * owner this link; here they add their own email + password to provision their
 * admin login. No session required — authorised by the token in the URL.
 */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const business = await getClaimableBusiness(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10 text-plum-ink">
      <div className="w-full max-w-md">
        {business ? (
          <ClaimBusinessForm token={token} businessName={business.name} />
        ) : (
          <div className="rounded-tile border border-plum-ink/10 bg-white p-6 text-center">
            <p className="text-3xl">🔗</p>
            <h1 className="mt-2 font-heading text-xl font-bold">Link unavailable</h1>
            <p className="mt-1 text-sm text-plum-ink/60">
              This setup link is invalid or has already been used. If your account is already set
              up, just sign in.
            </p>
            <Link href="/login" className="mt-5 inline-block rounded-full border border-plum-ink/15 px-6 py-2.5 text-sm font-semibold">
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
