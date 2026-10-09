import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { REF_COOKIE, normalizeReferralCode } from "@/lib/agent-kit/ref";
import { SignupForm } from "./SignupForm";

/**
 * Public self-signup is invite-only: the platform owner creates accounts (they
 * sell a done-for-you setup). Direct visitors are sent to the login page.
 *
 * The gate is the `?ref=` parameter, which is what an invite link carries —
 * and what a CANVEXIA sales agent's link carries. A visitor who arrived on an
 * agent's link earlier and comes back without it still has the agent's cookie,
 * which counts as the invite.
 *
 * The agent code is read from the URL as well as the cookie: middleware sets
 * the cookie on the response, so on the very first visit it is not readable
 * yet. Anything that cannot be a code is no code, and the form is then exactly
 * the form it always was.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const cookieCode = (await cookies()).get(REF_COOKIE)?.value ?? null;
  if (!ref && !cookieCode) redirect("/login");
  // First agent wins: the cookie, set by the first link, before this URL.
  const agentCode = normalizeReferralCode(cookieCode) ?? normalizeReferralCode(ref);
  return <SignupForm agentCode={agentCode} />;
}
