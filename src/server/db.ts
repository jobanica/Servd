import { PrismaClient } from "@prisma/client";

/**
 * Base Prisma client (singleton). In dev, Next.js hot-reload would otherwise
 * spawn a new client on every change and exhaust the connection pool.
 *
 * IMPORTANT: queries made directly on this client are NOT tenant-scoped — they
 * run without an `app.current_restaurant_id` setting, so RLS returns nothing
 * (or everything, only inside a super-admin context). Application code should
 * almost always go through `tenantDb()` or `systemDb()` in ./tenancy.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
