import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The home page no longer shows a price, and the login page no longer offers
 * "Create an account" (sign-up is reached through agents' links instead).
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the home page", () => {
  const home = read("src/app/page.tsx");

  it("has no pricing section, nav link or footer link", () => {
    expect(home).not.toMatch(/id="pricing"/);
    expect(home).not.toMatch(/#pricing/);
    expect(home).not.toMatch(/One price\. Everything included\./);
  });

  it("names no subscription price anywhere, the FAQ included", () => {
    // (Menu prices in the demo screenshots are fine; the plan's price isn't.)
    expect(home).not.toMatch(/₱800/);
    expect(home).not.toMatch(/\/ month|a month/);
    expect(home).not.toMatch(/How much does it cost\?/);
  });

  it("keeps the refund policy the footer links to", () => {
    expect(home).toMatch(/id="refund"/);
    expect(home).toMatch(/\["Refund policy", "#refund"\]/);
  });
});

describe("the login page", () => {
  it("doesn't offer to create an account", () => {
    const login = read("src/app/(platform)/login/page.tsx");
    expect(login).not.toMatch(/href="\/signup"/);
    expect(login).not.toMatch(/Create an account/);
  });
});
