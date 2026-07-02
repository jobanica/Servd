import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

/** True if a demo storefront belongs to this partner (ownership gate). */
export async function partnerOwnsDemo(id: string, partnerId: string): Promise<boolean> {
  try {
    const hit = await systemDb((tx) =>
      tx.restaurant.findFirst({ where: { id, demoPartnerId: partnerId }, select: { id: true } }),
    );
    return !!hit;
  } catch {
    return false;
  }
}

export interface PartnerDemoRow {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
  createdAt: string;
}

/** Demo storefronts a partner has created (newest first). */
export async function listPartnerDemos(partnerId: string): Promise<PartnerDemoRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: { demoPartnerId: partnerId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          createdAt: true,
          _count: { select: { menuItems: true } },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.displayName || r.name,
      slug: r.slug,
      itemCount: r._count.menuItems,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return []; // demoPartnerId column not migrated yet
  }
}
