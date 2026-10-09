import "server-only";
import { configFromEnv, type AgentPortalConfig } from "@/lib/agent-kit/client";

/**
 * servdph.com's connection to the CANVEXIA agent portal.
 *
 * Null until AGENT_PORTAL_URL, AGENT_PORTAL_PRODUCT_SLUG and
 * AGENT_PORTAL_SECRET are ALL set. Read straight from process.env, never
 * through a validator that throws: unconfigured, signups and receipts still
 * work and events still queue — they go out once it is configured.
 */
export function portalConfig(): AgentPortalConfig | null {
  return configFromEnv({
    AGENT_PORTAL_URL: process.env.AGENT_PORTAL_URL,
    AGENT_PORTAL_PRODUCT_SLUG: process.env.AGENT_PORTAL_PRODUCT_SLUG,
    AGENT_PORTAL_SECRET: process.env.AGENT_PORTAL_SECRET,
  });
}

/** The address to register in the portal as this product's callback URL. */
export function callbackUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://servdph.com").replace(/\/+$/, "");
  return `${base}/api/portal/callback`;
}
