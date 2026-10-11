/**
 * Dormant accounts — the only ones super-admin may delete.
 *
 * Dormant = no order in DORMANT_DAYS, and the account is old enough that this
 * isn't a restaurant still setting up. Pure, so the rule the filter shows and
 * the rule the delete enforces are one rule.
 */
export const DORMANT_DAYS = 60;
/** A new signup with no orders yet is setting up, not dormant. */
export const MIN_ACCOUNT_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isDormant(
  a: { createdAt: Date | string; lastOrderAt: Date | string | null },
  now = new Date(),
): boolean {
  const age = now.getTime() - new Date(a.createdAt).getTime();
  if (age < MIN_ACCOUNT_AGE_DAYS * DAY_MS) return false;
  if (!a.lastOrderAt) return true;
  return now.getTime() - new Date(a.lastOrderAt).getTime() >= DORMANT_DAYS * DAY_MS;
}

/** "no orders ever" / "last order 94 days ago" — for the confirm prompt. */
export function lastActivityLabel(lastOrderAt: Date | string | null, now = new Date()): string {
  if (!lastOrderAt) return "no orders ever";
  const days = Math.floor((now.getTime() - new Date(lastOrderAt).getTime()) / DAY_MS);
  return `last order ${days} day${days === 1 ? "" : "s"} ago`;
}
