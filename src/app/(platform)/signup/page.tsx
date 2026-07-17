import { redirect } from "next/navigation";
import { SignupForm } from "./SignupForm";

/**
 * Public self-signup is invite-only: the platform owner creates accounts (they
 * sell a done-for-you setup). Direct visitors are sent to the login page.
 * Referral links (/signup?ref=CODE) still work so the referral program is intact.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  if (!ref) redirect("/login");
  return <SignupForm />;
}
