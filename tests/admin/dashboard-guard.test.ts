import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { managerCanAccess, MANAGER_HOME } from "@/lib/admin/manager-scope";

/**
 * Manager access is decided in one place — requireAdminPage — by path. A page
 * that instead writes its own `role !== "admin"` test opts out of that silently,
 * and no amount of testing the rules catches it.
 *
 * That is exactly how the dashboard broke: it kept a local admin-only check, so
 * a manager signing in landed on /admin and was bounced to /login. From the
 * outside it looked like being logged out two seconds after logging in.
 */

const ADMIN_APP = join(process.cwd(), "src/app/(platform)/admin");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the dashboard gates managers in one place", () => {
  const files = walk(ADMIN_APP);

  it("finds the admin app to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no page deciding admin-only access on its own", () => {
    // Any file here that hard-codes the role has stepped around the shared
    // guard. If one legitimately needs to, it belongs in requireAdminPage's
    // rules — not in a page where the next person won't find it.
    const offenders = files
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return (
          /role\s*!==\s*"admin"/.test(src) ||
          /requireStaff\(\s*\[\s*"admin"\s*\]\s*\)/.test(src)
        );
      })
      .map((f) => f.replace(process.cwd() + "/", ""));

    expect(offenders).toEqual([]);
  });
});

describe("the manager's landing page", () => {
  it("is somewhere a manager is allowed to open", () => {
    // The invariant the bug violated. Whatever sign-in redirects a manager to
    // has to be a path the access rules permit, or they bounce straight back
    // out and it reads as a failed login.
    expect(managerCanAccess(MANAGER_HOME)).toBe(true);
  });

  it("is the dashboard", () => {
    expect(MANAGER_HOME).toBe("/admin");
  });
});
