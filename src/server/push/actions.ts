"use server";

import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { tenantDb } from "@/server/tenancy/scoped-db";

const MERCHANT_ROLES = ["merchant", "cashier", "admin", "manager"] as const;

const schema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
});

export type PushSubInput = z.infer<typeof schema>;

/**
 * Stores (or refreshes) a merchant device's Web Push subscription so new online
 * orders can alert it in the background. Keyed by endpoint so re-subscribing the
 * same device updates in place.
 */
export async function savePushSubscription(input: PushSubInput): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };
  let staff;
  try {
    staff = await requireStaff([...MERCHANT_ROLES]);
  } catch {
    return { ok: false };
  }
  try {
    await tenantDb(staff.restaurantId, (tx) =>
      tx.pushSubscription.upsert({
        where: { endpoint: parsed.data.endpoint },
        create: { restaurantId: staff.restaurantId, ...parsed.data },
        update: { restaurantId: staff.restaurantId, p256dh: parsed.data.p256dh, auth: parsed.data.auth },
        select: { id: true },
      }),
    );
    return { ok: true };
  } catch {
    return { ok: false }; // table not migrated yet
  }
}
