"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import { getBalance, getLoyaltyConfig } from "./loyalty";

/** Diner-facing loyalty lookup by phone (no session — scoped by slug). */
export async function getMyLoyalty(
  slug: string,
  phone: string,
): Promise<{ enabled: boolean; points: number; pointValue: number } | null> {
  if (!slug) return null;
  const r = await systemDb((tx) => tx.restaurant.findFirst({ where: { slug }, select: { id: true } }));
  if (!r) return null;
  const cfg = await getLoyaltyConfig(r.id);
  const points = phone ? await getBalance(r.id, phone) : 0;
  return { enabled: cfg.enabled, points, pointValue: cfg.pointValue };
}
