import { cookies } from "next/headers";
import { REF_COOKIE, normalizeReferralCode } from "@/lib/agent-kit/ref";
import { SignupForm } from "./SignupForm";

/**
 * Public self-signup. Anyone can create a restaurant; it goes live once the
 * activation is paid by QR and CANVEXIA confirms it.
 *
 * A sales agent's code prefills the referral field — from the URL as well as
 * the cookie, because middleware sets the cookie on the response, so on the
 * very first visit it is not readable yet. The first agent's link wins.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const cookieCode = (await cookies()).get(REF_COOKIE)?.value ?? null;
  const agentCode = normalizeReferralCode(cookieCode) ?? normalizeReferralCode(ref);
  return <SignupForm agentCode={agentCode} />;
}
