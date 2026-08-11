import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

export interface DemoStorefrontRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  itemCount: number;
  createdAt: string;
}

/** Demo storefronts = tenants with NO login account (created from super-admin). */
export async function listDemoStorefronts(): Promise<DemoStorefrontRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        // Also login-less, but a different funnel entirely: DIY previews belong
        // on the funnel page, not in the partner/super-admin demo list.
        where: { staff: { none: {} }, status: { notIn: ["preview", "archived"] } },
        orderBy: { createdAt: "desc" },
        take: 300,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          createdAt: true,
          _count: { select: { menuItems: true } },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.displayName || r.name,
      slug: r.slug,
      status: r.status,
      itemCount: r._count.menuItems,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export interface DemoMenuItem {
  id: string;
  name: string;
  price: number; // centavos
  description: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
}
export interface DemoCategory {
  id: string;
  name: string;
  items: DemoMenuItem[];
}
export interface DemoStorefront {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoUrl: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  categories: DemoCategory[];
}

export async function getDemoStorefront(id: string): Promise<DemoStorefront | null> {
  try {
    return await systemDb(async (tx) => {
      const r = await tx.restaurant.findFirst({
        where: { id },
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          status: true,
          logoUrl: true,
          tagline: true,
          printerConfig: true,
        },
      });
      if (!r) return null;
      const cats = await tx.category.findMany({
        where: { restaurantId: id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          menuItems: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, name: true, price: true, description: true, imageUrl: true, isAvailable: true },
          },
        },
      });
      const contact = (r.printerConfig as { receipt?: { address?: string; phone?: string } } | null)?.receipt;
      return {
        id: r.id,
        name: r.displayName || r.name,
        slug: r.slug,
        status: r.status,
        logoUrl: r.logoUrl,
        tagline: r.tagline,
        address: contact?.address || null,
        phone: contact?.phone || null,
        categories: cats.map((c) => ({ id: c.id, name: c.name, items: c.menuItems })),
      };
    });
  } catch {
    return null;
  }
}
