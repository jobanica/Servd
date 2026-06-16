"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { pesosToCentavos } from "@/lib/money";
import type { DayHours, DeliveryZone } from "./storefront";

export type StorefrontState = { ok?: boolean; error?: string } | null;

export async function updateStorefront(
  _prev: StorefrontState,
  formData: FormData,
): Promise<StorefrontState> {
  const { restaurantId } = await requireAdminAction();

  // Hours: 7 days of open/close/closed.
  const hours: DayHours[] = Array.from({ length: 7 }, (_, i) => ({
    open: String(formData.get(`open_${i}`) ?? "09:00"),
    close: String(formData.get(`close_${i}`) ?? "21:00"),
    closed: formData.get(`closed_${i}`) === "on",
  }));

  // Delivery zones: parallel name[]/fee[] arrays.
  const names = formData.getAll("zoneName").map((v) => String(v).trim());
  const fees = formData.getAll("zoneFee").map((v) => Number(v) || 0);
  const zones: DeliveryZone[] = names
    .map((name, i) => ({ name, fee: pesosToCentavos(Math.max(0, fees[i] ?? 0)) }))
    .filter((z) => z.name);

  const pauseWhenClosed = formData.get("pauseWhenClosed") === "on";
  const hoursJson = hours as unknown as Prisma.InputJsonValue;
  const zonesJson = zones as unknown as Prisma.InputJsonValue;
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.upsert({
        where: { restaurantId },
        create: { restaurantId, hours: hoursJson, deliveryZones: zonesJson, pauseWhenClosed },
        update: { hours: hoursJson, deliveryZones: zonesJson, pauseWhenClosed },
      }),
    );
  } catch (e) {
    const msg = String(e);
    return {
      error: /storefront|column|relation|table/i.test(msg)
        ? "Storefront settings need a quick database update. Run the migration, then try again."
        : "Couldn't save.",
    };
  }
  revalidatePath("/admin/storefront");
  return { ok: true };
}
