import "server-only";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/server/tenancy/scoped-db";

/**
 * Append-only audit trail. Every sensitive change (voids, item edits, discount
 * overrides, table-status changes) records who/what/when with before/after
 * snapshots. Reused across features — pass the SAME transaction client so the
 * log commits atomically with the change it describes.
 *
 * Best-effort: if the audit_logs table isn't migrated yet, the write is skipped
 * rather than failing the underlying operation.
 */
export interface AuditEntry {
  actorStaffId?: string | null;
  actorEmail?: string | null;
  action: string; // "order.void", "order.item_void", "table.status", …
  entityType: string; // "order", "table", "order_item", …
  entityId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Write an audit row inside an existing transaction. Never throws. */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  entry: AuditEntry,
): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        restaurantId,
        actorStaffId: entry.actorStaffId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        reason: entry.reason ?? null,
        before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch {
    /* audit_logs not migrated yet — skip, never block the real write */
  }
}

/** Convenience: open a tenant transaction just to record one audit row. */
export async function audit(restaurantId: string, entry: AuditEntry): Promise<void> {
  await tenantDb(restaurantId, (tx) => writeAudit(tx, restaurantId, entry));
}
