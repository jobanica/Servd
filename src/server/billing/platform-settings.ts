import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { encryptJson, decryptJson } from "@/lib/crypto/secrets";

export interface XenditCreds {
  secretKey: string;
  callbackToken: string;
}

export interface PlatformBilling {
  provider: "xendit" | "paymongo" | null;
  xendit: XenditCreds | null;
}

/** Read the platform billing config (decrypted). Best-effort. */
export async function getPlatformBilling(): Promise<PlatformBilling> {
  try {
    const row = await systemDb((tx) =>
      tx.platformSetting.findUnique({
        where: { id: "platform" },
        select: { billingProvider: true, xenditCredsEnc: true },
      }),
    );
    if (!row) return { provider: null, xendit: null };
    const xendit = row.xenditCredsEnc ? decryptJson<XenditCreds>(row.xenditCredsEnc) : null;
    return {
      provider: (row.billingProvider as PlatformBilling["provider"]) ?? null,
      xendit,
    };
  } catch {
    return { provider: null, xendit: null };
  }
}

/** Whether Xendit is configured (for status display — never returns the keys). */
export async function getBillingStatus(): Promise<{ provider: string | null; xenditConfigured: boolean }> {
  const b = await getPlatformBilling();
  return { provider: b.provider, xenditConfigured: !!b.xendit?.secretKey };
}

/**
 * Master switch for monthly order caps across ALL restaurants. Default OFF, so
 * everyone gets unlimited orders until the platform owner turns capping on
 * (e.g. once there are enough subscribers). Best-effort: if the column/table
 * lags, treat as OFF (never cap).
 */
export async function getOrderCapEnabled(): Promise<boolean> {
  try {
    const row = await systemDb((tx) =>
      tx.platformSetting.findUnique({ where: { id: "platform" }, select: { orderCapEnabled: true } }),
    );
    return !!row?.orderCapEnabled;
  } catch {
    return false;
  }
}

/** Turn the global order cap on/off. */
export async function setOrderCapEnabled(enabled: boolean): Promise<void> {
  await systemDb((tx) =>
    tx.platformSetting.upsert({
      where: { id: "platform" },
      create: { id: "platform", orderCapEnabled: enabled },
      update: { orderCapEnabled: enabled },
    }),
  );
}

/** Save Xendit credentials (encrypted) and select it as the billing provider. */
export async function saveXenditCreds(creds: XenditCreds): Promise<void> {
  const enc = encryptJson(creds);
  await systemDb((tx) =>
    tx.platformSetting.upsert({
      where: { id: "platform" },
      create: { id: "platform", billingProvider: "xendit", xenditCredsEnc: enc },
      update: { billingProvider: "xendit", xenditCredsEnc: enc },
    }),
  );
}
