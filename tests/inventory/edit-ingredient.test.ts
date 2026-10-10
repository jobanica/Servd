import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Editing an ingredient — name, unit, cost per unit, low-stock level,
 * supplier. Reported from the floor: only "Adjust" existed, so a wrong price
 * or a misspelt name could not be fixed at all.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const actions = read("src/server/inventory/actions.ts");
const table = read("src/components/admin/inventory/InventoryTable.tsx");

describe("the edit action", () => {
  const body = actions.slice(actions.indexOf("export async function editInventoryItem"));
  const fn = body.slice(0, body.indexOf("\nexport async function"));

  it("saves the cost per unit, in centavos", () => {
    expect(fn).toMatch(/costPerUnit: pesosToCentavos\(d\.costPesos\)/);
  });

  it("never touches the stock count — that goes through Adjust", () => {
    expect(fn).not.toMatch(/stockQty/);
  });

  it("validates every field together instead of silently clearing missing ones", () => {
    expect(actions).toMatch(/const editSchema = z\.object\(\{[\s\S]*costPesos:[\s\S]*reorderLevel:[\s\S]*supplierId:/);
    expect(fn).toMatch(/editSchema\.parse\(/);
  });

  it("only edits this restaurant's ingredients, never a product's stock row", () => {
    expect(fn).toMatch(/where: \{ id: d\.id, restaurantId, menuItemId: null \}/);
  });

  it("refuses a supplier from another restaurant", () => {
    expect(fn).toMatch(/tx\.supplier\.findFirst\(\{\s*where: \{ id: d\.supplierId, restaurantId \}/);
  });

  it("the old unvalidated update is gone", () => {
    expect(actions).not.toMatch(/export async function updateInventoryItem/);
  });
});

describe("the ingredient card", () => {
  it("has an Edit button beside Adjust", () => {
    expect(table).toMatch(/onClick=\{\(\) => onMode\("edit"\)\}/);
    expect(table).toMatch(/✏️ Edit/);
    expect(table).toMatch(/Adjust \{open \? "▴" : "▾"\}/);
  });

  it("edits name, cost, unit, low-stock level and supplier", () => {
    for (const name of ["name", "costPesos", "unit", "reorderLevel", "supplierId"]) {
      expect(table, name).toMatch(new RegExp(`name="${name}"[^>]*defaultValue=`));
    }
  });
});
