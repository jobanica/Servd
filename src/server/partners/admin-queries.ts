import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

export interface PartnerOverviewRow {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
  payoutMethod: string | null;
  createdAt: Date;
  payable: number; // centavos, unpaid commissions not yet in a payout
  paid: number; // centavos
}

export interface PayoutRow {
  id: string;
  partnerId: string;
  partnerName: string;
  period: string;
  amount: number;
  status: string;
  paidAt: Date | null;
}

export async function getPartnersOverview(): Promise<{ partners: PartnerOverviewRow[]; payouts: PayoutRow[] }> {
  try {
    return await systemDb(async (tx) => {
      const partners = await tx.partner.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, status: true, tier: true, payoutMethod: true, createdAt: true },
      });

      const payableRows = await tx.commission.groupBy({
        by: ["partnerId"],
        where: { status: "payable", payoutId: null },
        _sum: { amount: true },
      });
      const paidRows = await tx.commission.groupBy({
        by: ["partnerId"],
        where: { status: "paid" },
        _sum: { amount: true },
      });
      const payableBy = new Map(payableRows.map((r) => [r.partnerId, r._sum.amount ?? 0]));
      const paidBy = new Map(paidRows.map((r) => [r.partnerId, r._sum.amount ?? 0]));

      const payoutRows = await tx.payout.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, partnerId: true, period: true, amount: true, status: true, paidAt: true },
      });
      const nameBy = new Map(partners.map((p) => [p.id, p.name]));

      return {
        partners: partners.map((p) => ({
          ...p,
          payable: payableBy.get(p.id) ?? 0,
          paid: paidBy.get(p.id) ?? 0,
        })),
        payouts: payoutRows.map((p) => ({ ...p, partnerName: nameBy.get(p.partnerId) ?? "—" })),
      };
    });
  } catch {
    return { partners: [], payouts: [] };
  }
}
