"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { periodKey } from "@/lib/referrals/rules";
import { getOrCreatePartnerCode } from "./portal";

function revalidate() {
  revalidatePath("/super-admin/partners");
}

/** Approve / reject / suspend a partner. Approving issues their referral code. */
export async function setPartnerStatus(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["approved", "suspended", "rejected", "pending"].includes(status)) return;

  await systemDb((tx) => tx.partner.update({ where: { id }, data: { status } }));
  if (status === "approved") {
    try {
      await getOrCreatePartnerCode(id);
    } catch {
      /* code can also be issued lazily on first portal load */
    }
  }
  revalidate();
}

/**
 * Create a payout batch for a partner from their unpaid, payable commissions —
 * only if the total meets the minimum (below threshold rolls over). Status is
 * `requested`; money is NEVER moved automatically.
 */
export async function createPayoutBatch(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const partnerId = String(formData.get("partnerId") ?? "");
  if (!partnerId) return;

  await systemDb(async (tx) => {
    const settings = await tx.programSetting.findUnique({ where: { id: "program" } });
    const minPayout = settings?.minPayout ?? 50000;

    const partner = await tx.partner.findUnique({ where: { id: partnerId }, select: { payoutMethod: true } });
    const commissions = await tx.commission.findMany({
      where: { partnerId, status: "payable", payoutId: null },
      select: { id: true, amount: true },
    });
    const total = commissions.reduce((s, c) => s + c.amount, 0);
    if (commissions.length === 0 || total < minPayout) return; // rolls over

    const payout = await tx.payout.create({
      data: {
        partnerId,
        period: periodKey(new Date()),
        amount: total,
        method: partner?.payoutMethod ?? null,
        status: "requested",
      },
      select: { id: true },
    });
    await tx.commission.updateMany({
      where: { id: { in: commissions.map((c) => c.id) } },
      data: { payoutId: payout.id },
    });
  });
  revalidate();
}

/** Advance a payout: requested → approved → paid. Marking paid settles its
 *  commissions (record-keeping only; disbursement happens externally). */
export async function setPayoutStatus(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["approved", "paid"].includes(status)) return;

  await systemDb(async (tx) => {
    if (status === "paid") {
      await tx.commission.updateMany({ where: { payoutId: id }, data: { status: "paid" } });
      await tx.payout.update({ where: { id }, data: { status: "paid", paidAt: new Date() } });
    } else {
      await tx.payout.update({ where: { id }, data: { status: "approved" } });
    }
  });
  revalidate();
}
