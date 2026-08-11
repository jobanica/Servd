import { manilaStartOfDay } from "@/lib/time/manila";

/**
 * When a follow-up step is due. Pure and framework-free, because the day maths
 * is the part that decides whether someone gets an email — and the part that
 * would silently blast an old list if it were wrong.
 */

/**
 * How many days late the runner will still deliver a step.
 *
 * Without a ceiling, "day 3 or later" means adding a new step next year fires
 * it instantly at every lead ever created. With one, a missed cron run (or two)
 * still catches up, but a newly-added step only reaches people who are actually
 * near that point in their sequence.
 */
export const CATCH_UP_DAYS = 3;

/**
 * No automated email goes out until a full day has really passed since they
 * gave us their address.
 *
 * Day offsets are calendar days, so without this floor a lead who signed up at
 * 11:50 PM would be "1 day old" ten minutes later and get their first follow-up
 * almost immediately. The sequence starts after 24 real hours, always.
 */
export const MIN_HOURS_BEFORE_FIRST = 24;

/** Have a full 24 hours actually elapsed since they subscribed? */
export function hasWaitedMinimum(subscribedAt: Date | string, now: Date = new Date()): boolean {
  const elapsed = now.getTime() - new Date(subscribedAt).getTime();
  return elapsed >= MIN_HOURS_BEFORE_FIRST * 3_600_000;
}

/**
 * Whole days elapsed in Manila between two instants. Calendar days, not 24-hour
 * blocks: a preview created at 11 PM Monday is "1 day old" on Tuesday, which is
 * what "day 1" means to the person reading the schedule.
 */
export function daysSince(from: Date | string, now: Date = new Date()): number {
  const start = manilaStartOfDay(from).getTime();
  const today = manilaStartOfDay(now).getTime();
  return Math.floor((today - start) / 86_400_000);
}

/**
 * Is this lead in the window for this step right now?
 *
 * Due from the step's day, and for CATCH_UP_DAYS after it. Combined with the
 * one-row-per-(step, lead) unique index, sending is both self-healing and
 * exactly-once.
 */
export function isStepDue(dayOffset: number, previewCreatedAt: Date | string, now?: Date): boolean {
  const age = daysSince(previewCreatedAt, now);
  return age >= dayOffset && age < dayOffset + CATCH_UP_DAYS;
}

/** The `previewCreatedAt` range a step is currently due for — for the query. */
export function dueRange(dayOffset: number, now: Date = new Date()): { from: Date; to: Date } {
  const today = manilaStartOfDay(now).getTime();
  // Oldest still eligible: created (dayOffset + CATCH_UP_DAYS - 1) days ago.
  const from = new Date(today - (dayOffset + CATCH_UP_DAYS - 1) * 86_400_000);
  // Newest eligible: created exactly dayOffset days ago (end of that day).
  const to = new Date(today - dayOffset * 86_400_000 + 86_400_000);
  return { from, to };
}
