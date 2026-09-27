import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The "More" menu on an order card.
 *
 * It was a dropdown anchored `right-0` and 11rem (176px) wide. "More" wraps
 * onto its own line at the LEFT of the card, so on a phone its right edge sits
 * around x=121 and the menu was laid out from x=-55 — Void, Discount, Split
 * payment and Points were off the side of the screen, on the device the till
 * actually runs on.
 *
 * The rule: this menu is anchored to the viewport on a phone, so no button
 * position can push it off an edge.
 */

const src = readFileSync(
  join(process.cwd(), "src/components/cashier/CashierBoard.tsx"),
  "utf8",
);

/** The class string of the overflow menu container. */
const menuClass =
  /Void[\s\S]*?/.test(src) && /<div className="(fixed inset-x-0 bottom-0[^"]*)"/.exec(src)?.[1];

describe("the order overflow menu", () => {
  it("exists and is anchored to the viewport, not to the button", () => {
    expect(menuClass, "the menu should be a viewport-anchored sheet").toBeTruthy();
    expect(menuClass).toContain("fixed");
    expect(menuClass).toContain("inset-x-0");
    expect(menuClass).toContain("bottom-0");
  });

  it("spans the full width on a phone, so it cannot run off either edge", () => {
    // inset-x-0 pins both edges to the viewport. No width is set below `sm`,
    // which is what makes the overflow impossible rather than merely unlikely.
    expect(menuClass).not.toMatch(/(^|\s)w-\d/);
    expect(menuClass).toMatch(/sm:w-44/);
  });

  it("only becomes a button-anchored dropdown at desktop width", () => {
    // right-0 is fine there: the card is wide and the button is nowhere near
    // the left edge of the screen.
    expect(menuClass).toContain("sm:absolute");
    expect(menuClass).toContain("sm:right-0");
    // and it must undo the phone anchoring, or it would stay stuck to the
    // bottom of the window on a desktop too.
    expect(menuClass).toContain("sm:inset-x-auto");
    expect(menuClass).toContain("sm:bottom-auto");
  });

  it("never anchors right without a phone-safe fallback", () => {
    // The shape of the original bug, stated so it can't come back: a bare
    // `absolute right-0` on a fixed-width menu.
    expect(src).not.toMatch(/className="absolute right-0 z-20 mt-1 w-44/);
  });

  it("can be scrolled and dismissed when it is a sheet", () => {
    // Eight actions plus a header on a short phone in landscape would otherwise
    // have no way out.
    expect(menuClass).toMatch(/max-h-\[70vh\]/);
    expect(menuClass).toContain("overflow-y-auto");
    expect(src).toContain('aria-label="Close"');
  });

  it("keeps clear of the home indicator", () => {
    expect(menuClass).toMatch(/pb-\[max\(0\.5rem,env\(safe-area-inset-bottom\)\)\]/);
  });

  it("says which order it belongs to, since it covers the card", () => {
    // Voiding an order you can no longer see is the failure worth preventing.
    expect(src).toMatch(/sm:hidden[\s\S]{0,400}\{t\.label\}/);
  });
});
