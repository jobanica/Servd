"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { uploadMenuImage } from "@/server/storage/menu-images";
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
  const acceptsBookings = formData.get("acceptsBookings") === "on";
  // Advance-order downpayment config.
  const dpType = formData.get("downpaymentType") === "fixed" ? "fixed" : "percent";
  const dpRaw = Number(formData.get("downpaymentValue")) || 0;
  const bookingConfig = {
    requireDownpayment: formData.get("requireDownpayment") === "on",
    downpaymentType: dpType,
    // Percent stays a whole number; a fixed peso amount is stored in centavos.
    downpaymentValue: dpType === "percent" ? Math.max(0, Math.min(100, Math.round(dpRaw))) : pesosToCentavos(Math.max(0, dpRaw)),
    downpaymentInstructions: String(formData.get("downpaymentInstructions") ?? "").trim().slice(0, 500),
  };
  // Payment methods (manual e-wallet / bank QR + cash). Each QR is either a
  // freshly uploaded image or the previously-saved URL passed back via a hidden
  // field. Resolve all three (GCash / Maya / Bank) the same way.
  async function resolveQr(prefix: string, label: string): Promise<string | { error: string }> {
    let url = String(formData.get(`${prefix}QrUrl`) ?? "").trim();
    const file = formData.get(`${prefix}Qr`);
    if (file instanceof File && file.size > 0) {
      try {
        url = await uploadMenuImage(restaurantId, file);
      } catch (e) {
        return { error: e instanceof Error ? e.message : `Couldn't upload the ${label} QR image.` };
      }
    }
    return url.slice(0, 500);
  }
  const gcashQrUrl = await resolveQr("gcash", "GCash");
  if (typeof gcashQrUrl !== "string") return gcashQrUrl;
  const mayaQrUrl = await resolveQr("maya", "Maya");
  if (typeof mayaQrUrl !== "string") return mayaQrUrl;
  const bankQrUrl = await resolveQr("bank", "bank");
  if (typeof bankQrUrl !== "string") return bankQrUrl;

  const str = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max);
  const paymentConfig = {
    codEnabled: formData.get("codEnabled") === "on",
    codFeeEnabled: formData.get("codFeeEnabled") === "on",
    codFee: pesosToCentavos(Math.max(0, Number(formData.get("codFeePesos")) || 0)),
    gcashEnabled: formData.get("gcashEnabled") === "on",
    gcashName: str("gcashName", 120),
    gcashNumber: str("gcashNumber", 40),
    gcashQrUrl,
    mayaEnabled: formData.get("mayaEnabled") === "on",
    mayaName: str("mayaName", 120),
    mayaNumber: str("mayaNumber", 40),
    mayaQrUrl,
    bankEnabled: formData.get("bankEnabled") === "on",
    bankName: str("bankName", 120),
    bankNumber: str("bankNumber", 40),
    bankQrUrl,
    packagingFeeEnabled: formData.get("packagingFeeEnabled") === "on",
    packagingFee: pesosToCentavos(Math.max(0, Number(formData.get("packagingFeePesos")) || 0)),
    packagingFeeScope: formData.get("packagingFeeScope") === "all" ? "all" : "delivery",
  };
  // Delivery pricing: zones (fixed per area) or distance (base + per-km). Peso
  // inputs → centavos; the store origin comes from a pinned lat/lng.
  const dpNum = (k: string) => Number(formData.get(k)) || 0;
  const originLat = formData.get("originLat") ? Number(formData.get("originLat")) : null;
  const originLng = formData.get("originLng") ? Number(formData.get("originLng")) : null;
  const deliveryModeRaw = formData.get("deliveryMode");
  const deliveryConfig = {
    mode: deliveryModeRaw === "distance" ? "distance" : deliveryModeRaw === "shipping" ? "shipping" : "zones",
    baseFee: pesosToCentavos(Math.max(0, dpNum("baseFeePesos"))),
    perKm: pesosToCentavos(Math.max(0, dpNum("perKmPesos"))),
    freeKm: Math.max(0, dpNum("freeKm")),
    minFee: pesosToCentavos(Math.max(0, dpNum("minFeePesos"))),
    maxKm: Math.max(0, dpNum("maxKm")),
    roadFactor: dpNum("roadFactor") > 0 ? dpNum("roadFactor") : 1.3,
    originLat: originLat != null && Number.isFinite(originLat) ? originLat : null,
    originLng: originLng != null && Number.isFinite(originLng) ? originLng : null,
    // Checkbox: when unchecked, the delivery fee is NOT added to the order total
    // (the customer settles it with the rider directly).
    feeInTotal: formData.get("deliveryFeeInTotal") === "on",
    // Checkbox: when unchecked, the checkout map pin is hidden (typed address only).
    mapEnabled: formData.get("mapEnabled") === "on",
  };
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
  // `acceptsBookings` / `bookingConfig` are newer columns — write them separately
  // so an un-migrated DB still saves hours/zones (they just won't stick yet).
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.update({
        where: { restaurantId },
        data: {
          acceptsBookings,
          bookingConfig: bookingConfig as unknown as Prisma.InputJsonValue,
          paymentConfig: paymentConfig as unknown as Prisma.InputJsonValue,
          deliveryConfig: deliveryConfig as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      }),
    );
  } catch {
    // Newer columns may lag — retry with just the toggle so the rest still saves.
    try {
      await tenantDb(restaurantId, (tx) =>
        tx.storefrontSetting.update({ where: { restaurantId }, data: { acceptsBookings }, select: { id: true } }),
      );
    } catch { /* columns not migrated yet */ }
  }
  revalidatePath("/admin/storefront");
  return { ok: true };
}
