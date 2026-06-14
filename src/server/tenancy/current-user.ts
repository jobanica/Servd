import { createSupabaseServerClient } from "@/lib/supabase/server";
import { systemDb } from "@/server/tenancy/scoped-db";
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

    const staff = await tx.staffUser.findUnique({
      where: { authUserId: user.id },
    });
    if (staff) {
      return {
        kind: "staff",
        authUserId: user.id,
        staffUserId: staff.id,
        restaurantId: staff.restaurantId,
        role: staff.role,
        email: staff.email,
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
