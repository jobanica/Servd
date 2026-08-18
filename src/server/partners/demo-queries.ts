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

export interface DemoLogin {
  converted: boolean;
  username: string | null;
}

/**
 * Whether a storefront has become a real account, and under what login.
 *
 * Kept separate from getDemoStorefront (which the super-admin screen shares) so
 * the partner detail page can ask this one question without either screen
 * having to carry the other's fields.
 */
export async function demoLogin(restaurantId: string): Promise<DemoLogin> {
  try {
    const staff = await systemDb((tx) =>
      tx.staffUser.findFirst({
        where: { restaurantId },
        orderBy: { createdAt: "asc" },
        select: { username: true },
      }),
    );
    return { converted: !!staff, username: staff?.username ?? null };
  } catch {
    // Treat "can't tell" as converted: it hides the convert form and the delete
    // button, which is the safe way to be wrong.
    return { converted: true, username: null };
  }
}

export interface PartnerDemoRow {
  id: string;
  name: string;
  slug: string;
  itemCount: number;
  createdAt: string;
  /** Converted to a real account — it has a login the owner uses. */
  converted: boolean;
  /** The owner's login handle, once converted. */
  username: string | null;
}

/**
 * Storefronts a partner has built (newest first) — both the demos still being
 * pitched and the ones that became real accounts.
 *
 * "Real account" is decided by whether a login exists, not by restaurant
 * status: a demo is created `active` too (its ordering page has to work while
 * it's being shown around), so status can't tell the two apart. A staff row is
 * exactly what conversion adds.
 */
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
          staff: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { username: true },
          },
        },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.displayName || r.name,
      slug: r.slug,
      itemCount: r._count.menuItems,
      createdAt: r.createdAt.toISOString(),
      converted: r.staff.length > 0,
      username: r.staff[0]?.username ?? null,
    }));
  } catch {
    return []; // demoPartnerId column not migrated yet
  }
}
