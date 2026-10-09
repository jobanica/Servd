import type { CodeLookupResponse } from "@/lib/agent-kit/events";

/**
 * Whether the portal POSITIVELY said this code is not an active agent's. Only
 * that drops a code: no answer (null — not configured, timed out, down) keeps
 * it, so a portal outage never loses an agent their customer.
 */
export function portalRefusedCode(lookup: CodeLookupResponse | null): boolean {
  return !!lookup && (lookup.valid === false || lookup.active === false);
}
