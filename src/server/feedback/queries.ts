import { tenantDb } from "@/server/tenancy/scoped-db";

/** Feedback inbox for the owner: every rating + comment, newest first. */
export async function getFeedbackList(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        order: {
          select: { id: true, table: { select: { tableNumber: true } } },
        },
      },
    }),
  );
}

/** Simple aggregate stats for the inbox header. */
export async function getFeedbackStats(restaurantId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const agg = await tx.feedback.aggregate({
      _avg: { rating: true },
      _count: true,
    });
    return {
      count: agg._count,
      average: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : null,
    };
  });
}
