import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { safeLoginPath } from "@/lib/pwa/app-login";

/**
 * Servd installs as separate phone apps from one site: Servd (cashier),
 * Servd Orders (merchant), Riders and Servd Kitchen.
 *
 * Two Android rules pull against each other:
 *  - Chrome calls a page "already installed" when ANY installed app's scope
 *    covers it. With every app scoped to "/", installing Riders made the
 *    merchant app impossible to install.
 *  - An installed app that navigates outside its scope can crash ("Orders keeps
 *    stopping") — which is what a lapsed session's redirect to /login did when
 *    the merchant app was scoped to /merchant before.
 *
 * So each app is scoped to its own path, and everything it redirects to (sign
 * in, sign out, a paused account) lives inside that path.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const manifest = (f: string) => JSON.parse(read(`public/${f}`)) as { id: string; start_url: string; scope: string };

/** Would a WebAPK with this scope open this path? */
function inScope(scope: string, path: string): boolean {
  return path === scope || path.startsWith(scope.endsWith("/") ? scope : `${scope}/`);
}

const APPS = [
  { file: "manifest.webmanifest", app: "cashier", pages: ["cashier/page.tsx", "cashier/delivery/page.tsx", "cashier/ticket/[orderId]/page.tsx"] },
  { file: "merchant.webmanifest", app: "merchant", pages: ["merchant/page.tsx"] },
  { file: "rider.webmanifest", app: "rider", pages: ["rider/page.tsx"] },
  { file: "kitchen.webmanifest", app: "kitchen", pages: ["kitchen/page.tsx"] },
];

describe("each installable app", () => {
  for (const { file, app, pages } of APPS) {
    describe(file, () => {
      const m = manifest(file);

      it("is its own app, scoped to its own path", () => {
        expect(m.id).toBe(`/${app}`);
        expect(m.start_url).toBe(`/${app}`);
        expect(m.scope).toBe(`/${app}`);
      });

      it("never covers another app's start page", () => {
        for (const other of APPS) {
          if (other.app === app) continue;
          expect(inScope(m.scope, manifest(other.file).start_url), other.file).toBe(false);
        }
      });

      it("signs in inside its scope", () => {
        expect(inScope(m.scope, `/${app}/login`)).toBe(true);
        expect(existsSync(join(process.cwd(), `src/app/(platform)/${app}/login/page.tsx`))).toBe(true);
      });

      it("sends a lapsed session to its own sign-in, never to /login", () => {
        for (const p of pages) {
          const src = read(`src/app/(platform)/${p}`);
          expect(src, p).toMatch(new RegExp(`redirect\\("/${app}/login"\\)`));
          expect(src, p).not.toMatch(/redirect\("\/login"\)/);
          expect(src, p).not.toMatch(/redirect\("\/suspended"\)/);
        }
      });
    });
  }
});

describe("signing out", () => {
  it("lands on the sign-in the form names, and only one of ours", () => {
    expect(safeLoginPath("/rider/login")).toBe("/rider/login");
    expect(safeLoginPath("https://evil.example/login")).toBe("/login");
    expect(safeLoginPath(null)).toBe("/login");
    expect(read("src/app/(platform)/login/actions.ts")).toMatch(/redirect\(to\);/);
  });

  it("keeps each app's sign-out inside it", () => {
    expect(read("src/components/rider/RiderApp.tsx")).toMatch(/<SignOutButton dark to="\/rider\/login" \/>/);
    expect(read("src/components/merchant/SignOutButton.tsx")).toMatch(/to = "\/merchant\/login"/);
    expect(read("src/components/cashier/CashierBoard.tsx")).toMatch(/name="to" value="\/cashier\/login"/);
    expect(read("src/components/cashier/OpenShiftScreen.tsx")).toMatch(/name="to" value="\/cashier\/login"/);
    expect(read("src/app/(platform)/kitchen/page.tsx")).toMatch(/name="to" value="\/kitchen\/login"/);
  });

  it("a paused account stays inside the cashier and kitchen apps", () => {
    expect(read("src/app/(platform)/cashier/page.tsx")).toMatch(/redirect\("\/cashier\/suspended"\)/);
    expect(read("src/app/(platform)/kitchen/page.tsx")).toMatch(/redirect\("\/kitchen\/suspended"\)/);
  });
});

describe("links that leave an app", () => {
  it("open in the browser instead of navigating the app out of scope", () => {
    expect(read("src/app/(platform)/merchant/page.tsx")).toMatch(/href="\/admin\/billing\?upgrade=onlineOrdering" target="_blank"/);
    expect(read("src/components/merchant/MerchantBoard.tsx")).toMatch(/href="\/admin\/advance-orders"[\s\S]{0,120}target="_blank"/);
    expect(read("src/app/(platform)/kitchen/page.tsx")).toMatch(/href="\/clock\/me" target="_blank"/);
  });
});

describe("inScope", () => {
  it("does not let a sibling path masquerade as in-scope", () => {
    expect(inScope("/merchant", "/merchant-tools")).toBe(false);
    expect(inScope("/merchant", "/merchant")).toBe(true);
    expect(inScope("/merchant", "/merchant/login")).toBe(true);
    expect(inScope("/rider", "/riders")).toBe(false);
  });
});
