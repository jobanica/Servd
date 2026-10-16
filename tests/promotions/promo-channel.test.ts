import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizePromoChannel,
  promoAppliesTo,
  wrongChannelMessage,
  channelBadge,
  promoMechanics,
  storefrontPromos,
} from "@/lib/promotions/channel";

/**
 * A promotion can be for everywhere, online orders only (delivery & pickup),
 * or dine-in only. Every redemption path checks it on the server, and the
 * ordering website shows the online ones with their mechanics.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("where a promo applies", () => {
  it("treats a missing or unknown channel as everywhere", () => {
    expect(normalizePromoChannel(null)).toBeNull();
    expect(normalizePromoChannel("")).toBeNull();
    expect(normalizePromoChannel("delivery")).toBeNull();
    expect(promoAppliesTo(null, "online")).toBe(true);
    expect(promoAppliesTo(null, "dine_in")).toBe(true);
  });

  it("keeps an online promo off dine-in, and a dine-in promo off online", () => {
    expect(promoAppliesTo("online", "online")).toBe(true);
    expect(promoAppliesTo("online", "dine_in")).toBe(false);
    expect(promoAppliesTo("dine_in", "dine_in")).toBe(true);
    expect(promoAppliesTo("dine_in", "online")).toBe(false);
  });

  it("tells the customer why a code was refused", () => {
    expect(wrongChannelMessage("online")).toMatch(/online orders only/);
    expect(wrongChannelMessage("dine_in")).toMatch(/dine-in only/);
    expect(channelBadge("online")).toBe("🛵 Online only");
    expect(channelBadge("dine_in")).toBe("🍽️ Dine-in only");
    expect(channelBadge(null)).toBeNull();
  });
});

describe("the mechanics shown on the ordering website", () => {
  const base = { type: "percent", value: 20, minSpend: 0, expiresAt: null, code: "SAVE20", channel: null };

  it("spells out the offer, minimum, where, until when and the code", () => {
    const lines = promoMechanics({
      ...base,
      minSpend: 50_000,
      channel: "online",
      expiresAt: "2026-10-31T15:59:00.000Z", // Oct 31, 11:59 PM Manila
    });
    expect(lines).toEqual([
      "20% off",
      "Minimum order of ₱500.00",
      "Online orders only (delivery & pickup)",
      "Valid until Oct 31, 2026",
      "Use code SAVE20 at checkout",
    ]);
  });

  it("names the free item and says free delivery is for delivery orders", () => {
    expect(promoMechanics({ ...base, type: "free_item", code: "HALO" }, { freeItemName: "Halo-halo" })[0]).toBe(
      "Free Halo-halo",
    );
    expect(promoMechanics({ ...base, type: "bogo" }, { freeItemName: "Siopao" })[0]).toBe("Buy 1 Siopao, get 1 free");
    expect(promoMechanics({ ...base, type: "free_delivery" })).toContain("For delivery orders");
  });

  it("never claims an info-only promo needs no code", () => {
    expect(promoMechanics({ ...base, type: "info", code: null })).toEqual([]);
  });

  it("lists only online and everywhere promos, never dine-in ones or expired ones", () => {
    const now = new Date("2026-10-16T04:00:00.000Z");
    const p = (id: string, channel: string | null, extra = {}) => ({
      ...base,
      id,
      title: id,
      description: null,
      freeItemId: null,
      channel,
      ...extra,
    });
    const shown = storefrontPromos(
      [
        p("all", null),
        p("web", "online"),
        p("table", "dine_in"),
        p("old", "online", { expiresAt: "2026-10-01T00:00:00.000Z" }),
        p("free", "online", { type: "free_item", freeItemId: "i1", code: "free1" }),
      ],
      new Map([["i1", "Halo-halo"]]),
      now,
    );
    expect(shown.map((x) => x.id)).toEqual(["all", "web", "free"]);
    expect(shown[2].code).toBe("FREE1");
    expect(shown[2].mechanics[0]).toBe("Free Halo-halo");
  });
});

describe("every redemption path checks the channel on the server", () => {
  it("the ordering website redeems as online", () => {
    expect(read("src/server/orders/web-order.ts")).toMatch(
      /resolvePromo\(restaurant\.id, d\.couponCode, built, deliveryFee, "online"\)/,
    );
  });

  it("a table QR order redeems as dine-in", () => {
    expect(read("src/server/orders/place-order.ts")).toMatch(
      /resolvePromo\(ctx\.restaurantId, couponCode, built, 0, "dine_in"\)/,
    );
  });

  it("the bill-stage code is dine-in, and lists only dine-in codes", () => {
    const src = read("src/server/promotions/apply-bill.ts");
    expect(src).toMatch(/promoAppliesTo\(promo\.channel, "dine_in"\)/);
    expect(src).toMatch(/getActivePromotions\(restaurant\.id, "dine_in"\)/);
  });

  it("resolvePromo and the preview refuse a code used in the wrong place", () => {
    const src = read("src/server/promotions/redeem.ts");
    expect(src).toMatch(/channel: true/);
    expect(src).toMatch(/if \(!promoAppliesTo\(promo\.channel, where\)\) return null;/);
    expect(src).toMatch(/error: wrongChannelMessage\(promo\.channel\)/);
  });

  it("each preview says where it is", () => {
    expect(read("src/components/site/WebOrder.tsx")).toMatch(/where: "online",/);
    expect(read("src/components/diner/DinerMenu.tsx")).toMatch(/where: "dine_in",/);
  });

  it("the table menus only show promos that work at the table", () => {
    for (const p of ["src/app/(diner)/order/[slug]/[tableToken]/page.tsx", "src/app/sites/[host]/t/[tableToken]/page.tsx"]) {
      expect(read(p), p).toMatch(/getActivePromotions\(restaurant\.id, "dine_in"\)/);
    }
  });
});

describe("the owner sets it, and the website shows it", () => {
  it("the add form and the list both offer the choice, and it is saved", () => {
    expect(read("src/components/admin/AddPromotionForm.tsx")).toMatch(/name="channel"/);
    expect(read("src/app/(platform)/admin/promotions/page.tsx")).toMatch(/<PromoChannelSelect/);
    const actions = read("src/server/promotions/actions.ts");
    expect(actions).toMatch(/channel: normalizePromoChannel\(formData\.get\("channel"\)\)/);
    expect(actions).toMatch(/export async function setPromotionChannel/);
  });

  it("both storefront pages pass the online promos to the ordering page", () => {
    for (const p of ["src/app/r/[slug]/page.tsx", "src/app/sites/[host]/page.tsx"]) {
      const src = read(p);
      expect(src, p).toMatch(/getStorefrontPromos\(restaurant\.id, categories\)/);
      expect(src, p).toMatch(/promotions=\{promotions\}/);
    }
    expect(read("src/server/promotions/storefront.ts")).toMatch(/getActivePromotions\(restaurantId, "online"\)/);
    expect(read("src/components/site/WebOrder.tsx")).toMatch(/p\.mechanics\.map/);
  });
});
