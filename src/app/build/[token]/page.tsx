import { redirect } from "next/navigation";
import { getBuildState } from "@/server/build/queries";
import { setBuildCookie } from "@/server/build/session";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Return-to-edit link. Many owners won't finish in one sitting, so the token
 * doubles as a magic URL: opening it re-establishes the cookie and drops them
 * back into the wizard exactly where they left off.
 */
export default async function ResumeBuildPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await getBuildState(token);
  if (state) await setBuildCookie(token);
  redirect("/build");
}
