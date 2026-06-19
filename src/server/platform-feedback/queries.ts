import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

export interface PlatformFeedbackRow {
  id: string;
  restaurantName: string | null;
  authorEmail: string | null;
  rating: number | null;
  message: string;
  resolved: boolean;
  createdAt: string;
}

/** All SaaS feedback from restaurants, newest first (super-admin). */
export async function listPlatformFeedback(): Promise<PlatformFeedbackRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.platformFeedback.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    );
    return rows.map((r) => ({
      id: r.id,
      restaurantName: r.restaurantName,
      authorEmail: r.authorEmail,
      rating: r.rating,
      message: r.message,
      resolved: r.resolved,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
