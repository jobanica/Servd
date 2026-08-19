/**
 * Which branch a multi-branch login is currently working in.
 *
 * An owner with several shops is staff at each one; the session says WHO they
 * are, and this says WHICH of their restaurants they're looking at. Kept pure
 * and separate from the cookie plumbing so the choice can be tested — picking
 * the wrong branch means serving one shop's orders and takings under another's
 * name, which is worse than showing no data at all.
 */

export interface Membership {
  restaurantId: string;
  /** Oldest first. Ties are broken by id so the default never flickers. */
  createdAt: string;
}

/**
 * Pick the active branch from what the login belongs to and what they last
 * chose.
 *
 * The requested branch wins ONLY if they're actually a member of it — the value
 * arrives in a cookie, which is to say from the browser, so it's a request and
 * never a fact. Anything else falls back to their oldest membership: the shop
 * they started with, and a stable answer that doesn't change under them when a
 * branch is added.
 */
export function pickBranch(
  memberships: readonly Membership[],
  requested: string | null | undefined,
): string | null {
  if (memberships.length === 0) return null;
  if (requested && memberships.some((m) => m.restaurantId === requested)) {
    return requested;
  }
  return [...memberships].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.restaurantId.localeCompare(b.restaurantId),
  )[0].restaurantId;
}

/** Cookie holding the branch the owner last switched to. */
export const BRANCH_COOKIE = "servd_branch";
/** A working day is the useful unit; a stale value falls back harmlessly. */
export const BRANCH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
