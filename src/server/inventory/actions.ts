"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { hasModule } from "@/server/billing/entitlements";
import { pesosToCentavos } from "@/lib/money";

export type FormState = { ok?: boolean; error?: string } | null;

async function ensureModule(restaurantId: string) {
  if (!(await hasModule(restaurantId, "inventory"))) {
    throw new Error("Your plan doesn't include Inventory. Upgrade to enable it.");
  }
}

const qty = z.coerce.number().min(0).max(1_000_000);

// ----------------------------------------------------------------- items
const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  unit: z.string().trim().min(1, "Unit is required").max(16),
  stockQty: qty.default(0),
  costPesos: z.coerce.number().min(0).max(1_000_000).default(0),
  reorderLevel: qty.default(0),
  supplierId: z.string().uuid().optional().or(z.literal("")),
});

export async function createInventoryItem(_p: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  try {
    await ensureModule(restaurantId);
    const d = itemSchema.parse({
      name: formData.get("name"),
      unit: formData.get("unit"),
      stockQty: formData.get("stockQty") ?? 0,
      costPesos: formData.get("costPesos") ?? 0,
      reorderLevel: formData.get("reorderLevel") ?? 0,
      supplierId: formData.get("supplierId") ?? "",
    });
    await tenantDb(restaurantId, async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          restaurantId,
          name: d.name,
          unit: d.unit,
          stockQty: d.stockQty,
          costPerUnit: pesosToCentavos(d.costPesos),
          reorderLevel: d.reorderLevel,
          supplierId: d.supplierId || null,
        },
      });
      if (d.stockQty > 0) {
        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: item.id,
            changeQty: d.stockQty,
            reason: "adjustment",
            unitCost: pesosToCentavos(d.costPesos),
            note: "Opening stock",
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    return { error: e instanceof Error ? e.message : "Couldn't add item" };
  }
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function updateInventoryItem(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.update({
      where: { id },
      data: {
        name: String(formData.get("name") ?? "").trim() || undefined,
        unit: String(formData.get("unit") ?? "").trim() || undefined,
        reorderLevel: Number(formData.get("reorderLevel") ?? 0),
        supplierId: (String(formData.get("supplierId") ?? "") || null) as string | null,
      },
    }),
  );
  revalidatePath("/admin/inventory");
}

export async function deleteInventoryItem(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.delete({ where: { id: String(formData.get("id")) } }),
  );
  revalidatePath("/admin/inventory");
}

// ------------------------------------------------- stock movements (manual)
async function applyMovement(
  restaurantId: string,
  itemId: string,
  newStock: number,
  changeQty: number,
  reason: "waste" | "adjustment" | "count",
  note?: string,
) {
  await tenantDb(restaurantId, async (tx) => {
    const inv = await tx.inventoryItem.findFirstOrThrow({ where: { id: itemId } });
    await tx.inventoryItem.update({ where: { id: itemId }, data: { stockQty: newStock } });
    await tx.stockMovement.create({
      data: { restaurantId, inventoryItemId: itemId, changeQty, reason, unitCost: inv.costPerUnit, note },
    });
  });
}

export async function recordWaste(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  const amount = Number(formData.get("qty") ?? 0);
  if (amount <= 0) return;
  const inv = await tenantDb(restaurantId, (tx) => tx.inventoryItem.findFirstOrThrow({ where: { id } }));
  await applyMovement(restaurantId, id, inv.stockQty - amount, -amount, "waste", "Waste");
  revalidatePath("/admin/inventory");
}

export async function recordCount(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  const counted = Number(formData.get("counted") ?? 0);
  const inv = await tenantDb(restaurantId, (tx) => tx.inventoryItem.findFirstOrThrow({ where: { id } }));
  await applyMovement(restaurantId, id, counted, counted - inv.stockQty, "count", "Stock count");
  revalidatePath("/admin/inventory");
}

// -------------------------------------------------------------- suppliers
export async function createSupplier(_p: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireAdminAction();
  try {
    await ensureModule(restaurantId);
    const name = z.string().trim().min(1).max(80).parse(formData.get("name"));
    const contact = String(formData.get("contact") ?? "").trim();
    await tenantDb(restaurantId, (tx) =>
      tx.supplier.create({
        data: { restaurantId, name, contactJson: contact ? { contact } : undefined },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add supplier" };
  }
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function deleteSupplier(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  await tenantDb(restaurantId, (tx) =>
    tx.supplier.delete({ where: { id: String(formData.get("id")) } }),
  );
  revalidatePath("/admin/inventory");
}

// --------------------------------------------------------- purchase orders
export async function createPurchaseOrder(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  const supplierId = String(formData.get("supplierId") ?? "") || null;
  await tenantDb(restaurantId, (tx) =>
    tx.purchaseOrder.create({ data: { restaurantId, supplierId, status: "draft" } }),
  );
  revalidatePath("/admin/inventory/po");
}

export async function addPurchaseOrderItem(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  const purchaseOrderId = String(formData.get("purchaseOrderId"));
  const inventoryItemId = String(formData.get("inventoryItemId"));
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitCost = pesosToCentavos(Number(formData.get("unitCostPesos") ?? 0));
  if (quantity <= 0) return;
  await tenantDb(restaurantId, async (tx) => {
    const po = await tx.purchaseOrder.findFirstOrThrow({ where: { id: purchaseOrderId } });
    if (po.status === "received") throw new Error("PO already received");
    await tx.purchaseOrderItem.create({
      data: { restaurantId, purchaseOrderId, inventoryItemId, quantity, unitCost },
    });
  });
  revalidatePath(`/admin/inventory/po/${purchaseOrderId}`);
}

/** Receives a PO: adds stock and updates each item's WEIGHTED-AVERAGE cost. */
export async function receivePurchaseOrder(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  const purchaseOrderId = String(formData.get("purchaseOrderId"));
  await tenantDb(restaurantId, async (tx) => {
    const po = await tx.purchaseOrder.findFirstOrThrow({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (po.status === "received") return;
    for (const line of po.items) {
      const inv = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId } });
      const newStock = inv.stockQty + line.quantity;
      const newCost =
        newStock > 0
          ? Math.round((inv.stockQty * inv.costPerUnit + line.quantity * line.unitCost) / newStock)
          : inv.costPerUnit;
      await tx.inventoryItem.update({
        where: { id: inv.id },
        data: { stockQty: newStock, costPerUnit: newCost },
      });
      await tx.stockMovement.create({
        data: {
          restaurantId,
          inventoryItemId: inv.id,
          changeQty: line.quantity,
          reason: "received",
          unitCost: line.unitCost,
          refId: purchaseOrderId,
        },
      });
    }
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "received", receivedAt: new Date() },
    });
  });
  revalidatePath(`/admin/inventory/po/${purchaseOrderId}`);
  revalidatePath("/admin/inventory");
}

// -------------------------------------------------------------- recipes
export async function setRecipeComponent(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  const menuItemId = String(formData.get("menuItemId"));
  const inventoryItemId = String(formData.get("inventoryItemId"));
  const quantity = Number(formData.get("quantity") ?? 0);
  await tenantDb(restaurantId, async (tx) => {
    const where = { menuItemId_inventoryItemId: { menuItemId, inventoryItemId } };
    if (quantity <= 0) {
      await tx.recipeComponent.deleteMany({ where: { menuItemId, inventoryItemId } });
      return;
    }
    await tx.recipeComponent.upsert({
      where,
      create: { restaurantId, menuItemId, inventoryItemId, quantity },
      update: { quantity },
    });
  });
  revalidatePath(`/admin/menu/${menuItemId}`);
}

// -------------------------------------------------------------- settings
export async function setAutoOutOfStock(formData: FormData): Promise<void> {
  const { restaurantId } = await requireAdminAction();
  await ensureModule(restaurantId);
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: { autoOutOfStock: formData.get("autoOutOfStock") === "on" },
    }),
  );
  revalidatePath("/admin/inventory");
}
