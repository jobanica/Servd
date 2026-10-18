/**
 * Each installable app has its own sign-in page INSIDE its own scope.
 *
 * Android Chrome treats a page as "already installed" when any installed app's
 * scope covers it, so the apps can't all claim the whole site ("/"): with
 * Riders installed, the merchant app said "This app is already installed". But
 * an app that leaves its scope crashes on some Android builds ("Orders keeps
 * stopping"), which is what happened when a lapsed session sent it to /login.
 * So every app is scoped to its own path and signs in, and signs out, there.
 */
export const APP_LOGIN_PATHS = [
  "/login",
  "/cashier/login",
  "/merchant/login",
  "/rider/login",
  "/kitchen/login",
] as const;

export type AppLoginPath = (typeof APP_LOGIN_PATHS)[number];

/** A sign-out target from a form, or the site's own sign-in when it isn't one of ours. */
export function safeLoginPath(raw: unknown): AppLoginPath {
  return (APP_LOGIN_PATHS as readonly string[]).includes(String(raw)) ? (raw as AppLoginPath) : "/login";
}
