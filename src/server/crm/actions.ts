"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperAdmin } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";
import { SEQUENCE, TOTAL_TOUCHES, addDays } from "@/lib/crm/sequence";
import type { CrmStage } from "./queries";

const PATH = "/super-admin/crm";

export type CrmActionState = { ok?: boolean; error?: string } | null;

const clientSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(120),
  facebookUrl: z.string().trim().max(300).optional().or(z.literal("")),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Add a client to the CRM (manually). */
export async function addClient(_prev: CrmActionState, formData: FormData): Promise<CrmActionState> {
  await requireSuperAdmin();
  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    facebookUrl: formData.get("facebookUrl") ?? "",
    contactName: formData.get("contactName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  try {
    await systemDb((tx) =>
      tx.crmClient.create({
        data: {
          id: randomUUID(),
          name: d.name,
          facebookUrl: d.facebookUrl || null,
          contactName: d.contactName || null,
          phone: d.phone || null,
          email: d.email || null,
          notes: d.notes || null,
          stage: "new",
        },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add the client. Run the CRM migration?" };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Log the next touch (initial message or follow-up) as sent. Advances the
 * sequence and schedules the next follow-up's due date. Records the touch.
 */
export async function logTouch(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  try {
    await systemDb(async (tx) => {
      const client = await tx.crmClient.findUnique({
        where: { id },
        select: { step: true, stage: true },
      });
      if (!client) throw new Error("Client not found");
      if (client.stage === "replied" || client.stage === "won") return; // no more outreach

      const newStep = Math.min(client.step + 1, TOTAL_TOUCHES);
      const sent = SEQUENCE[newStep - 1]; // the touch just sent (0-based)
      const upcoming = newStep < TOTAL_TOUCHES ? SEQUENCE[newStep] : null;
      const now = new Date();
      const nextDueAt = upcoming ? addDays(now, upcoming.waitDays) : null;

      await tx.crmTouch.create({
        data: { id: randomUUID(), clientId: id, step: newStep, label: sent?.label ?? null },
      });
      await tx.crmClient.update({
        where: { id },
        data: { step: newStep, lastTouchAt: now, nextDueAt, stage: "in_sequence" },
      });
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't log the message." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Mark that the client replied — removes them from the follow-up queue. */
export async function markReplied(id: string): Promise<{ ok?: boolean; error?: string }> {
  await requireSuperAdmin();
  try {
    await systemDb((tx) =>
      tx.crmClient.update({
        where: { id },
        data: { stage: "replied", repliedAt: new Date(), nextDueAt: null },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't update." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

const STAGES: CrmStage[] = ["new", "in_sequence", "replied", "won", "lost"];

/** Set a client's pipeline stage (e.g. won / lost / reopen). */
export async function setStage(id: string, stage: CrmStage): Promise<void> {
  await requireSuperAdmin();
  if (!STAGES.includes(stage)) return;
  // Won/lost stop follow-ups; reopening to in_sequence keeps the schedule.
  const clearDue = stage === "won" || stage === "lost" || stage === "replied";
  await systemDb((tx) =>
    tx.crmClient.update({
      where: { id },
      data: {
        stage,
        ...(clearDue ? { nextDueAt: null } : {}),
        ...(stage === "replied" ? { repliedAt: new Date() } : {}),
      },
    }),
  );
  revalidatePath(PATH);
}

/** Update a client's notes. */
export async function updateNotes(id: string, notes: string): Promise<void> {
  await requireSuperAdmin();
  await systemDb((tx) =>
    tx.crmClient.update({ where: { id }, data: { notes: notes.slice(0, 2000) || null } }),
  );
  revalidatePath(PATH);
}

/** Remove a client (and their touch history) from the CRM. */
export async function deleteClient(id: string): Promise<void> {
  await requireSuperAdmin();
  await systemDb((tx) => tx.crmClient.delete({ where: { id } }));
  revalidatePath(PATH);
}
