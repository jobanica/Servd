/**
 * Display helpers that render instants in the restaurant's local timezone
 * (Philippines, Asia/Manila, UTC+8, no DST). The server runs in UTC (Vercel),
 * so formatting without an explicit timeZone shows UTC — e.g. a 2:07 PM Manila
 * clock-in renders as "06:07 AM". Always format wall-clock times through these.
 */

export const MANILA_TZ = "Asia/Manila";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "YYYY-MM-DD" for the Manila calendar day an instant falls on (stable key). */
export function manilaDayKey(d: Date | string): string {
  return new Date(new Date(d).getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** "2:07 PM" — clock time in Manila. */
export function manilaTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-PH", {
    timeZone: MANILA_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jun 26, 2026, 2:07 PM" — date + clock time in Manila. */
export function manilaDateTime(d: Date | string): string {
  return new Date(d).toLocaleString("en-PH", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Jun 26, 2026" — calendar date in Manila. */
export function manilaDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-PH", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
