import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";

export type CrmStage = "new" | "in_sequence" | "replied" | "won" | "lost";

export interface CrmClientRow {
  id: string;
  name: string;
  facebookUrl: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  stage: CrmStage;
  step: number;
  lastTouchAt: string | null;
  nextDueAt: string | null;
  repliedAt: string | null;
  source: string;
  createdAt: string;
}

/** All CRM clients, newest first. Empty if the table isn't migrated yet. */
export async function listClients(limit = 1000): Promise<CrmClientRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.crmClient.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      facebookUrl: r.facebookUrl,
      contactName: r.contactName,
      phone: r.phone,
      email: r.email,
      notes: r.notes,
      stage: r.stage as CrmStage,
      step: r.step,
      lastTouchAt: r.lastTouchAt?.toISOString() ?? null,
      nextDueAt: r.nextDueAt?.toISOString() ?? null,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return []; // not migrated yet
  }
}
