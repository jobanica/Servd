import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import type { AnalyticsBundle } from "@/server/analytics/queries";
import { formatPeso } from "@/lib/money";

/**
 * Real Claude-generated business insights for the admin dashboard.
 *
 * We feed Claude a compact summary of the restaurant's recent performance and
 * ask for a few short, actionable insights (e.g. "Tuesdays are slow — try a
 * lunch promo"). Results are cached per-restaurant for an hour to keep the cost
 * and latency low — insights don't need to be real-time.
 *
 * Everything is best-effort: if ANTHROPIC_API_KEY is unset or the call fails,
 * this returns null and the dashboard falls back to its rule-based insights.
 */

export interface InsightsInput {
  restaurantName: string;
  /** Trailing 7-day analytics. */
  week: AnalyticsBundle | null;
  /** Today's analytics. */
  today: AnalyticsBundle | null;
  /** Count of ingredients currently running low (inventory module). */
  lowStockCount: number;
}

/** Whether AI insights are configured (API key present). */
export function aiInsightsEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Build the compact, token-light data summary we hand to Claude. */
function buildPrompt(input: InsightsInput): string {
  const { restaurantName, week, today, lowStockCount } = input;
  const lines: string[] = [];
  lines.push(`Restaurant: ${restaurantName}`);

  if (week) {
    lines.push(
      `Last 7 days — revenue: ${formatPeso(week.summary.revenue)}, orders: ${week.summary.orders}, average order value: ${formatPeso(week.summary.aov)}, average rating: ${week.summary.avgRating ?? "n/a"} (${week.summary.ratingCount} reviews).`,
    );
    if (week.revenueByDay.length) {
      lines.push(
        "Revenue by day: " +
          week.revenueByDay.map((d) => `${d.day}=${formatPeso(d.revenue)}`).join(", "),
      );
    }
    if (week.topItems.length) {
      lines.push("Best sellers: " + week.topItems.map((i) => `${i.name} (${i.qty})`).join(", "));
    }
    if (week.worstItems.length) {
      lines.push("Slowest sellers: " + week.worstItems.map((i) => `${i.name} (${i.qty})`).join(", "));
    }
    if (week.peakHours.length) {
      lines.push("Orders by hour (UTC): " + week.peakHours.map((h) => `${h.hour}:00=${h.orders}`).join(", "));
    }
    if (week.paymentMix.length) {
      lines.push("Payment mix: " + week.paymentMix.map((p) => `${p.method}=${p.count}`).join(", "));
    }
  } else {
    lines.push("No sales data for the last 7 days yet.");
  }

  if (today) {
    lines.push(
      `Today so far — revenue: ${formatPeso(today.summary.revenue)}, orders: ${today.summary.orders}.`,
    );
  }
  if (lowStockCount > 0) {
    lines.push(`${lowStockCount} ingredient(s) are currently running low on stock.`);
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are a restaurant business analyst for a QR-ordering platform in the Philippines (currency is Philippine pesos, ₱).
You are given a compact summary of one restaurant's recent performance.
Produce 3-5 short, concrete, actionable insights the owner can act on today.

Rules:
- Each insight is ONE sentence, max ~110 characters, plain language.
- Lead each with a single relevant emoji.
- Be specific and reference the data (a day, item, hour, or number) — never generic advice.
- Mix observations with suggestions (e.g. a slow day -> a promo idea; a best seller -> upsell/bundle idea).
- If data is sparse, say what to do to start getting useful insights instead of inventing trends.
- Note: hours are in UTC; phrase time-of-day insights loosely (e.g. "evenings") rather than exact clock times.
Return ONLY a JSON array of strings, nothing else. Example: ["🔥 ...", "⏰ ..."]`;

async function generate(input: InsightsInput): Promise<string[] | null> {
  if (!aiInsightsEnabled()) return null;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text) return null;

  // Be tolerant: the model may wrap the array in prose or a code fence.
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const insights = parsed
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);

  return insights.length ? insights : null;
}

/**
 * Cached AI insights for a restaurant. Cache key includes a coarse data
 * fingerprint so the insights refresh when sales actually move, and at most
 * once per hour otherwise.
 */
export async function getAiInsights(
  restaurantId: string,
  input: InsightsInput,
): Promise<string[] | null> {
  if (!aiInsightsEnabled()) return null;

  // Fingerprint the inputs so meaningfully different data busts the cache.
  const fp = [
    input.week?.summary.revenue ?? 0,
    input.week?.summary.orders ?? 0,
    input.today?.summary.orders ?? 0,
    input.lowStockCount,
  ].join(":");

  const cached = unstable_cache(
    async () => generate(input),
    ["ai-insights", restaurantId, fp],
    { revalidate: 3600, tags: [`ai-insights:${restaurantId}`] },
  );

  try {
    return await cached();
  } catch {
    return null;
  }
}
