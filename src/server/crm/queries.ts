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
  address: string | null;
  notes: string | null;
  stage: CrmStage;
  step: number;
  lastTouchAt: string | null;
  nextDueAt: string | null;
  repliedAt: string | null;
  source: string;
  createdAt: string;
}

// Columns that exist on every CRM DB version (address ships in a later migration).
const BASE_SELECT = {
  id: true,
  name: true,
  facebookUrl: true,
  contactName: true,
  phone: true,
  email: true,
  notes: true,
  stage: true,
  step: true,
  lastTouchAt: true,
  nextDueAt: true,
  repliedAt: true,
  source: true,
  createdAt: true,
} as const;

type BaseRow = {
  id: string;
  name: string;
  facebookUrl: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  stage: string;
  step: number;
  lastTouchAt: Date | null;
  nextDueAt: Date | null;
  repliedAt: Date | null;
  source: string;
  createdAt: Date;
};

function mapRow(r: BaseRow, address: string | null): CrmClientRow {
  return {
    id: r.id,
    name: r.name,
    facebookUrl: r.facebookUrl,
    contactName: r.contactName,
    phone: r.phone,
    email: r.email,
    address,
    notes: r.notes,
    stage: r.stage as CrmStage,
    step: r.step,
    lastTouchAt: r.lastTouchAt?.toISOString() ?? null,
    nextDueAt: r.nextDueAt?.toISOString() ?? null,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
  };
}

/** All CRM clients, newest first. Resilient to a not-yet-migrated address column. */
export async function listClients(limit = 1000): Promise<CrmClientRow[]> {
  try {
    const rows = await systemDb((tx) =>
      tx.crmClient.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { ...BASE_SELECT, address: true },
      }),
    );
    return rows.map((r) => mapRow(r, r.address));
  } catch {
    // address column not migrated yet → read the base columns only.
    try {
      const rows = await systemDb((tx) =>
        tx.crmClient.findMany({ orderBy: { createdAt: "desc" }, take: limit, select: BASE_SELECT }),
      );
      return rows.map((r) => mapRow(r, null));
    } catch {
      return []; // table not migrated yet
    }
  }
}
