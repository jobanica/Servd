import "server-only";

/**
 * Fire-and-forget realtime signal that a restaurant's orders changed.
 *
 * We DON'T stream row data over realtime (that would need per-restaurant JWT
 * claims to satisfy RLS). Instead we broadcast a contentless "refresh" ping on a
 * per-restaurant channel; the kitchen/cashier clients react by refetching
 * through our session-scoped server actions, which are the trusted data path.
 *
 * Uses the Supabase Realtime broadcast REST endpoint with the service-role key.
 * Best-effort: failures never block the order write (clients also poll).
 */
export function ordersChannel(restaurantId: string): string {
  return `orders-${restaurantId}`;
}

export async function notifyOrdersChanged(restaurantId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return; // not configured (e.g. local without Supabase)

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: ordersChannel(restaurantId),
            event: "refresh",
            payload: {},
          },
        ],
      }),
    });
  } catch {
    // ignore — polling fallback will still pick up the change
  }
}
