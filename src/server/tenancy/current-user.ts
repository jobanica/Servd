import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";
import { pickBranch, BRANCH_COOKIE } from "@/lib/tenancy/active-branch";
import type { StaffRole } from "@prisma/client";

/**
 * Resolves the currently-authenticated principal from the Supabase session.
 *
 * Returns one of:
 *   - { kind: "staff",  restaurantId, role, ... }  — a restaurant's staff/admin
 *   - { kind: "super" }                            — the platform super-admin (you)
 *   - null                                         — not logged in
 *
 * CRITICAL: restaurantId is derived ONLY from the trusted session here, never
 * from the URL or request body. Everything downstream scopes to this value.
 */
export type CurrentUser =
  | {
      kind: "staff";
      authUserId: string;
      staffUserId: string;
      restaurantId: string;
      role: StaffRole;
      email: string;
      /**
       * How many restaurants this login is staff at. One for almost everyone;
       * more for an owner running branches, which is the only case where the
       * dashboard shows a branch switcher.
       */
      branchCount: number;
    }
  | { kind: "super"; authUserId: string; email: string }
  | null;

export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Look up the profile rows in a trusted (super-admin) context: we're resolving
  // identity itself, so we can't yet be tenant-scoped.
  return systemDb(async (tx) => {
    const admin = await tx.platformAdmin.findUnique({
      where: { authUserId: user.id },
    });
    if (admin) {
      return { kind: "super", authUserId: user.id, email: admin.email };
    }

    // findMany, not findUnique: one login can be staff at several restaurants
    // (an owner with branches). Which one they're looking at comes from the
    // branch cookie, checked against these rows — the cookie is a request from
    // the browser, so membership is verified here rather than trusted.
    const memberships = await tx.staffUser.findMany({
      where: { authUserId: user.id },
      select: {
        id: true,
        restaurantId: true,
        role: true,
        email: true,
        createdAt: true,
        // Only a LIVE branch can be worked in — an unactivated one has no
        // ordering and nothing to run, so a stale cookie pointing at one must
        // not strand the owner in a dashboard that can't do anything.
        restaurant: { select: { status: true } },
      },
    });

    if (memberships.length > 0) {
      const requested = (await cookies()).get(BRANCH_COOKIE)?.value ?? null;
      const activeId = pickBranch(
        memberships.map((m) => ({
          restaurantId: m.restaurantId,
          createdAt: m.createdAt.toISOString(),
          active: m.restaurant.status === "active",
        })),
        requested,
      );
      const staff = memberships.find((m) => m.restaurantId === activeId) ?? memberships[0];
      return {
        kind: "staff",
        authUserId: user.id,
        staffUserId: staff.id,
        restaurantId: staff.restaurantId,
        role: staff.role,
        email: staff.email,
        branchCount: memberships.length,
      };
    }

    // Authenticated with Supabase but no Servd profile — treat as logged out.
    return null;
  });
}

/** Throws unless a staff/admin user is logged in. Returns the user. */
export async function requireStaff(allowed?: StaffRole[]): Promise<
  Extract<CurrentUser, { kind: "staff" }>
> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff") {
    throw new Error("UNAUTHORIZED");
  }
  if (allowed && !allowed.includes(user.role)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/** Throws unless the platform super-admin is logged in. */
export async function requireSuperAdmin(): Promise<
  Extract<CurrentUser, { kind: "super" }>
> {
  const user = await getCurrentUser();
  if (!user || user.kind !== "super") {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}
