import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withAvailableSoon, AVAILABLE_SOON_ID } from "@/lib/menu/available-soon";
import type { DinerCategory, DinerItem } from "@/lib/cart/types";

/**
 * "Available soon": the owner ticks a dish, diners see it under its own button
 * in the menu, and nobody can order it until the box is unticked.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const item = (id: string, o: Partial<DinerItem> = {}): DinerItem => ({
  id, name: id, description: null, price: 10000, imageUrl: null, videoUrl: null,
  videoPosterUrl: null, isAvailable: true, dietaryTags: [], groups: [], ...o,
});

const menu: DinerCategory[] = [
  { id: "c1", name: "Silog", items: [item("tapsilog"), item("bangsilog", { comingSoon: true })] },
  { id: "c2", name: "Desserts", items: [item("halo-halo", { comingSoon: true })] },
  { id: "c3", name: "Empty on purpose", items: [] },
  { id: "c4", name: "Drinks", items: [item("coke")] },
];

describe("the Available soon section", () => {
  const out = withAvailableSoon(menu);

  it("is its own category at the end — the button in the menu", () => {
    const last = out.at(-1)!;
    expect(last.id).toBe(AVAILABLE_SOON_ID);
    expect(last.name).toBe("🔜 Available soon");
    expect(last.items.map((i) => i.id)).toEqual(["bangsilog", "halo-halo"]);
  });

  it("can't be ordered: every item in it is unavailable", () => {
    expect(out.at(-1)!.items.every((i) => i.isAvailable === false && i.comingSoon)).toBe(true);
  });

  it("takes the items out of their usual category", () => {
    expect(out.find((c) => c.id === "c1")!.items.map((i) => i.id)).toEqual(["tapsilog"]);
  });

  it("drops a category emptied only by it, keeps one that was already empty", () => {
    expect(out.find((c) => c.id === "c2")).toBeUndefined();
    expect(out.find((c) => c.id === "c3")).toBeDefined();
  });

  it("changes nothing when no item is coming soon", () => {
    const plain = [{ id: "c4", name: "Drinks", items: [item("coke")] }];
    expect(withAvailableSoon(plain)).toBe(plain);
  });

  it("speaks Filipino on the Filipino menu", () => {
    expect(withAvailableSoon(menu, "fil").at(-1)!.name).toBe("🔜 Malapit na");
  });
});

describe("the order path", () => {
  it("refuses an Available soon item from the website and QR menu, not the POS", () => {
    const src = read("src/server/orders/build-order.ts");
    expect(src).toMatch(/const comingSoon = channel === "pos" \? new Set<string>\(\) : await getComingSoonItemIds\(restaurantId\);/);
    expect(src).toMatch(/if \(comingSoon\.has\(dbItem\.id\)\) throw new OrderValidationError/);
  });

  it("diner menus get the section; the cashier POS doesn't", () => {
    expect(read("src/server/menu/public-menu.ts")).toMatch(
      /return opts\.includePosOnly \? shaped : withAvailableSoon\(shaped, locale\);/,
    );
  });

  it("the flag is read and saved best-effort, so a missing column can't break the menu", () => {
    expect(read("src/server/menu/coming-soon.ts")).toMatch(/catch \{\s*return new Set\(\);/);
    expect(read("src/server/menu/actions.ts")).toMatch(/if \(!formData\.has\("comingSoonField"\)\) return;/);
  });
});
