import "server-only";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { getCustomerTerms } from "@/lib/agent-kit/client";
import type { CustomerTermsResponse } from "@/lib/agent-kit/events";
import { nextBillingMonth, canSubmitActivation } from "@/lib/agent-kit/billing";
import { coverageOf, ownerNotice, type Coverage, type OwnerNotice } from "@/lib/agent-portal/lapse";
import { portalConfig } from "./config";

export interface PaymentDetails {
  qrUrl: string | null;
  gcash: { name: string; number: string } | null;
  maya: { name: string; number: string } | null;
  bank: { bank: string; name: string; number: string } | null;
  note: string | null;
}

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The stored JSON → a clean shape. Half-filled methods are dropped. */
export function normalizePaymentDetails(raw: unknown): PaymentDetails {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown> | string>;
  const obj = (k: string) => (r[k] && typeof r[k] === "object" ? (r[k] as Record<string, unknown>) : {});
  const g = obj("gcash");
  const m = obj("maya");
  const b = obj("bank");
  const qr = str(r.qrUrl, 500);
  return {
    qrUrl: /^https:\/\//.test(qr) ? qr : null,
    gcash: str(g.number) ? { name: str(g.name), number: str(g.number) } : null,
    maya: str(m.number) ? { name: str(m.name), number: str(m.number) } : null,
    bank: str(b.number) && str(b.bank) ? { bank: str(b.bank), name: str(b.name), number: str(b.number) } : null,
    note: str(r.note, 500) || null,
  };
}

/** At least one way to pay has been set up. Until then nothing is shown. */
export function hasPaymentMethod(d: PaymentDetails): boolean {
  return !!(d.qrUrl || d.gcash || d.maya || d.bank);
}

export async function getPaymentDetails(): Promise<PaymentDetails> {
  try {
    const row = await systemDb((tx) =>
      tx.paymentCollection.findUnique({ where: { id: "platform" }, select: { details: true } }),
    );
    return normalizePaymentDetails(row?.details);
  } catch {
    return normalizePaymentDetails(null);
  }
}

export interface AgentPayment {
  id: string;
  type: string;
  monthsCovered: number;
  billingMonth: string | null;
  amountCentavos: number;
  bankReference: string;
  status: string;
  reason: string | null;
  submittedAt: Date;
}

export interface AgentBillingState {
  agentCode: string;
  contractSigned: boolean;
  contractSignedAt: Date | null;
  minimumTermEndsAt: Date | null;
  payments: AgentPayment[];
  coverage: Coverage;
  notice: OwnerNotice;
  canSubmitActivation: boolean;
  suggestedMonth: string;
  /** From the portal, never stored here. Null when it can't be reached. */
  terms: CustomerTermsResponse | null;
  portalConfigured: boolean;
  paymentDetails: PaymentDetails;
}

/**
 * Everything the billing page needs for an agent-referred restaurant, or null
 * for every other account (including before add-agent-portal.sql has run).
 */
export async function getAgentBillingState(
  restaurantId: string,
  opts: { withTerms?: boolean } = {},
): Promise<AgentBillingState | null> {
  let base;
  try {
    base = await tenantDb(restaurantId, async (tx) => {
      const agent = await tx.agentAccount.findFirst({
        select: { agentCode: true, contractStatus: true, contractSignedAt: true, contractMinimumTermEndsAt: true },
      });
      // Every account without a code stops here, after one lookup.
      if (!agent) return null;
      return {
        agent,
        payments: await tx.subscriptionManualPayment.findMany({
          orderBy: { submittedAt: "desc" },
          take: 50,
          select: {
            id: true, type: true, monthsCovered: true, billingMonthStart: true, amountCentavos: true,
            bankReference: true, status: true, reason: true, submittedAt: true,
          },
        }),
        sub: await tx.subscription.findFirst({
          orderBy: { createdAt: "desc" },
          select: { status: true, trialEndsAt: true },
        }),
        restaurant: await tx.restaurant.findFirst({ select: { status: true } }),
      };
    });
  } catch {
    return null; // not migrated yet — no agent accounts exist
  }
  if (!base) return null;

  const coverage = coverageOf(base.payments.filter((p) => p.status === "confirmed"));
  const now = new Date();
  const config = portalConfig();
  const [terms, paymentDetails] = await Promise.all([
    opts.withTerms && config ? getCustomerTerms(config, restaurantId) : Promise.resolve(null),
    opts.withTerms ? getPaymentDetails() : Promise.resolve(normalizePaymentDetails(null)),
  ]);

  return {
    agentCode: base.agent.agentCode,
    contractSigned: base.agent.contractStatus === "signed",
    contractSignedAt: base.agent.contractSignedAt,
    minimumTermEndsAt: base.agent.contractMinimumTermEndsAt,
    payments: base.payments.map((p) => ({
      id: p.id,
      type: p.type,
      monthsCovered: p.monthsCovered,
      billingMonth: p.billingMonthStart ? p.billingMonthStart.toISOString().slice(0, 7) : null,
      amountCentavos: p.amountCentavos,
      bankReference: p.bankReference,
      status: p.status,
      reason: p.reason,
      submittedAt: p.submittedAt,
    })),
    coverage,
    notice: ownerNotice(
      {
        coverage,
        trialEndsAt: base.sub?.status === "trialing" ? base.sub.trialEndsAt : null,
        subscriptionStatus: base.sub?.status ?? null,
        suspended: base.restaurant?.status === "suspended",
      },
      now,
    ),
    canSubmitActivation: canSubmitActivation(base.payments),
    suggestedMonth: nextBillingMonth(coverage.paidUntil, now),
    terms,
    portalConfigured: !!config,
    paymentDetails,
  };
}
