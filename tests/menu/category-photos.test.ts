import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasTabPhotos } from "@/lib/menu/tab-photos";
import { withAvailableSoon } from "@/lib/menu/available-soon";
import type { DinerItem } from "@/lib/cart/types";

/** Photos on the menu's category tabs. */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the category strip", () => {
  it("shows photo tabs once any category has a photo, plain tabs otherwise", () => {
    expect(hasTabPhotos([{ id: "a", name: "A" }, { id: "b", name: "B", imageUrl: null }])).toBe(false);
    expect(hasTabPhotos([{ id: "a", name: "A" }, { id: "b", name: "B", imageUrl: "https://x/y.jpg" }])).toBe(true);
  });

  it("the cashier POS keeps its plain tabs — it passes no photos", () => {
    const pos = read("src/components/cashier/NewOrderModal.tsx");
    expect(pos).not.toMatch(/imageUrl: c\.imageUrl/);
  });
});

describe("where a tab photo comes from", () => {
  it("the owner's category photo, else the first visible dish photo", () => {
    const src = read("src/server/menu/public-menu.ts");
    expect(src).toMatch(
      /c\.imageUrl \?\?\s*c\.menuItems\.find\(\(i\) => !posOnly\.has\(i\.id\) && !comingSoon\.has\(i\.id\) && i\.imageUrl\)\?\.imageUrl \?\?\s*null/,
    );
  });

  it("the Available soon tab uses one of its dishes' photos", () => {
    const item = (id: string, o: Partial<DinerItem>): DinerItem => ({
      id, name: id, description: null, price: 1, imageUrl: null, videoUrl: null, videoPosterUrl: null,
      isAvailable: true, dietaryTags: [], groups: [], ...o,
    });
    const out = withAvailableSoon([
      { id: "c", name: "C", items: [item("a", { comingSoon: true }), item("b", { comingSoon: true, imageUrl: "https://x/b.jpg" })] },
    ]);
    expect(out.at(-1)!.imageUrl).toBe("https://x/b.jpg");
  });
});

describe("saving a category photo", () => {
  const src = read("src/server/menu/actions.ts");
  const fn = src.slice(src.indexOf("export async function setCategoryImage"));

  it("only touches this restaurant's category", () => {
    expect(fn).toMatch(/tx\.category\.updateMany\(\{ where: \{ id, restaurantId \}, data: \{ imageUrl \} \}\)/);
  });

  it("can be removed, so the dish photo stands in again", () => {
    expect(fn).toMatch(/formData\.get\("remove"\) === "1"/);
  });
});
