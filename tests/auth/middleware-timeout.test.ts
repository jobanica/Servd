import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Reported live at the dinner rush: "504 MIDDLEWARE_INVOCATION_TIMEOUT" on
 * servdph.com. The session refresh in middleware waited on Supabase with no
 * limit, so a slow database turned into a timeout on every page.
 */
describe("middleware session refresh", () => {
  const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

  it("never waits on Supabase without a limit", () => {
    expect(src).toMatch(/Promise\.race\(\[\s*supabase\.auth\.getUser\(\),/);
    expect(src).toMatch(/const SESSION_REFRESH_TIMEOUT_MS = \d+;/);
    expect(src).not.toMatch(/=\s*await supabase\.auth\.getUser\(\);/);
  });

  it("a timed-out refresh keeps the existing session instead of clearing it", () => {
    expect(src).toMatch(/renewed = !!result && !result\.error && !!result\.data\.user;/);
    expect(src).toMatch(/if \(!renewed\) return \[\];/);
  });
});
