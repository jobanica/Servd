import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allocatePayment, billingSaturday, isSaturday, recentSaturdays, weekPeriod } from "@/lib/neighborhood/commission";

/**
 * Commission is paid weekly, every Saturday, for the week before (Saturday to
 * Friday, Manila). Partners pay by Servd's bank QR and upload the receipt; the
 * founder confirms it, and only then is it applied — oldest week first.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the weekly cycle", () => {
  it("bills a Saturday for the Saturday-to-Friday before it, due that Saturday", () => {
    const w = weekPeriod("2026-11-14")!;
    expect(w.periodStart).toBe("2026-11-07");
    expect(w.periodEnd).toBe("2026-11-13");
    expect(w.dueOn).toBe("2026-11-14");
    // Manila midnights.
    expect(w.from.toISOString()).toBe("2026-11-06T16:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-11-13T16:00:00.000Z");
    expect(weekPeriod("2026-11-13")).toBeNull(); // not a Saturday
  });

  it("puts each day's orders on the right Saturday", () => {
    expect(billingSaturday("2026-11-06")).toBe("2026-11-07"); // Friday → the next day
    expect(billingSaturday("2026-11-07")).toBe("2026-11-14"); // Saturday → the following week
    expect(billingSaturday("2026-11-08")).toBe("2026-11-14"); // Sunday
  });

  it("knows its Saturdays", () => {
    expect(isSaturday("2026-11-07")).toBe(true);
    expect(isSaturday("2026-11-08")).toBe(false);
    expect(recentSaturdays("2026-11-06", 3)).toEqual(["2026-10-31", "2026-10-24", "2026-10-17"]);
    expect(recentSaturdays("2026-11-07", 1)).toEqual(["2026-11-07"]);
  });

  it("is built and issued automatically, due that Saturday, leaving no empty weeks", () => {
    const src = read("src/server/neighborhood/statements.ts");
    expect(src).toMatch(/export async function runWeeklyStatements/);
    expect(src).toMatch(/issueStatement\(built\.statementId, \{ dueOn: dueSaturday \}, now\)/);
    expect(src).toMatch(/s\.commissionDue === 0 && s\.orderCount === 0/);
  });
});

describe("applying a confirmed payment", () => {
  const open = [
    { id: "w1", commissionDue: 5_000, amountPaid: 0 },
    { id: "w2", commissionDue: 3_000, amountPaid: 1_000 },
  ];

  it("pays the oldest week first", () => {
    expect(allocatePayment(6_000, open)).toEqual({ applied: [{ id: "w1", amount: 5_000 }, { id: "w2", amount: 1_000 }], credit: 0 });
  });

  it("turns anything extra into a credit", () => {
    expect(allocatePayment(9_000, open)).toEqual({ applied: [{ id: "w1", amount: 5_000 }, { id: "w2", amount: 2_000 }], credit: 2_000 });
    expect(allocatePayment(1_500, [])).toEqual({ applied: [], credit: 1_500 });
  });
});

describe("the payment flow", () => {
  it("is applied only when the founder confirms, once", () => {
    const src = read("src/server/neighborhood/statements.ts");
    expect(src).toMatch(/where: \{ id: paymentId, status: "submitted" \},\s*data: \{ status: "confirmed"/);
    expect(src).toMatch(/commissionAmount: -credit,/);
    const actions = read("src/server/neighborhood/actions.ts");
    expect(actions).toMatch(/export async function confirmPaymentAction\(fd: FormData\): Promise<void> \{\s*await guard\(fd\);/);
    expect(actions).toMatch(/export async function rejectPaymentAction\(fd: FormData\): Promise<void> \{\s*await guard\(fd\);/);
  });

  it("a partner submits only for their own agreement, with a receipt, and never marks anything paid", () => {
    const src = read("src/server/neighborhood/partner-actions.ts");
    const submit = src.slice(src.indexOf("export async function submitCommissionPayment"));
    expect(submit).toMatch(/requireAdminAction\(\)/);
    expect(submit).toMatch(/restaurantId: me\.restaurantId, restaurant: \{ commercialTrack: "neighborhood" \}/);
    expect(submit).toMatch(/Upload the receipt/);
    expect(submit).not.toMatch(/status: "confirmed"|amountPaid/);
  });

  it("keeps receipts private, shown through signed URLs", () => {
    const storage = read("src/server/storage/commission-receipts.ts");
    expect(storage).toMatch(/ensureBucket\(supabase, COMMISSION_RECEIPT_BUCKET, false\)/);
    expect(storage).toMatch(/createSignedUrls/);
  });

  it("shows the bank QR from its own settings row, apart from the agent portal's", () => {
    expect(read("src/server/neighborhood/payment-details.ts")).toMatch(/NEIGHBORHOOD_PAYMENT_ROW = "neighborhood"/);
    expect(read("src/server/neighborhood/payment-actions.ts")).toMatch(/await requireOwnerAction\(\);/);
    expect(read("src/components/admin/commission/PayCommission.tsx")).toMatch(/details\.qrUrl/);
  });

  it("puts the total due and a Pay button on the dashboard, for neighborhood owners only", () => {
    const home = read("src/app/(platform)/admin/page.tsx");
    expect(home).toMatch(/restaurant\.commercialTrack === "neighborhood" && user\.role === "admin"/);
    expect(home).toMatch(/Total commission due/);
    expect(home).toMatch(/href="\/admin\/commission"/);
    expect(read("src/app/(platform)/admin/commission/page.tsx")).toMatch(/<PayCommission amountDue=\{data\.dueNow\}/);
  });

  it("the payments table is new and private to each partner", () => {
    const sql = read("prisma/manual/add-commission-payments.sql");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "commission_payments"/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CHECK \("amount" > 0\)/);
  });
});
