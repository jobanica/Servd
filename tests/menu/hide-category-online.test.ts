import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A whole category can be hidden from the online ordering website. The table
 * QR menu and the cashier still show it, and the website's order path refuses
 * its items even from a stale or crafted request.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("hiding a category from the website", () => {
  it("is a per-category flag, off for every existing category", () => {
    expect(read("prisma/schema.prisma")).toMatch(/hideOnline\s+Boolean\s+@default\(false\)/);
    expect(read("prisma/manual/add-category-hide-online.sql")).toMatch(
      /ADD COLUMN IF NOT EXISTS "hideOnline" BOOLEAN NOT NULL DEFAULT false/,
    );
  });

  it("is switched from the category header in the menu editor, for the owner's own categories only", () => {
    expect(read("src/app/(platform)/admin/menu/page.tsx")).toMatch(/hideOnline=\{category\.hideOnline\}/);
    const header = read("src/components/admin/CategoryHeader.tsx");
    expect(header).toMatch(/setCategoryHideOnline\(id, !hidden\)/);
    expect(header).toMatch(/Hidden online/);
    const actions = read("src/server/menu/actions.ts");
    expect(actions).toMatch(/export async function setCategoryHideOnline[\s\S]{0,200}requireManagerAction\(\)/);
    expect(actions).toMatch(/where: \{ id, restaurantId \}, data: \{ hideOnline: hidden \}/);
  });

  it("drops the category from every online storefront, and only there", () => {
    for (const p of ["src/app/r/[slug]/page.tsx", "src/app/sites/[host]/page.tsx", "src/app/preview/[slug]/page.tsx"]) {
      expect(read(p), p).toMatch(/getPublicMenu\(restaurant\.id, "en", \{ online: true \}\)/);
    }
    // The table QR menus don't ask for it, so they keep showing the category.
    for (const p of ["src/app/(diner)/order/[slug]/[tableToken]/page.tsx", "src/app/sites/[host]/t/[tableToken]/page.tsx"]) {
      expect(read(p), p).not.toMatch(/online: true/);
    }
    const menu = read("src/server/menu/public-menu.ts");
    expect(menu).toMatch(/opts\.online \? await getOnlineHiddenCategoryIds\(restaurantId\)/);
    expect(menu).toMatch(/!hiddenOnline\.has\(c\.id\)/);
  });

  it("refuses its items on a website order, but not at the table or the till", () => {
    const build = read("src/server/orders/build-order.ts");
    expect(build).toMatch(/channel === "online" \? await getOnlineHiddenCategoryIds\(restaurantId\)/);
    expect(build).toMatch(/isn't available for online orders/);
    expect(read("src/server/orders/web-order.ts")).toMatch(/buildValidatedOrder\(restaurant\.id, d\.lines, \{ channel: "online" \}\)/);
    expect(read("src/server/orders/place-order.ts")).not.toMatch(/channel: "online"/);
  });

  it("reads the flag best-effort, so a lagging database hides nothing", () => {
    const helper = read("src/server/menu/online-hidden.ts");
    expect(helper).toMatch(/catch \{\s*return new Set\(\);/);
  });
});
