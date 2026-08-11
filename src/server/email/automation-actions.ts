"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperAdminAction } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { runAutomation, type AutomationRun } from "./automation";

const PATH = "/super-admin/email";

export type AutomationActionState = { ok?: boolean; error?: string; run?: AutomationRun } | null;

const stepSchema = z.object({
  dayOffset: z.coerce.number().int().min(0, "Day can't be negative").max(365),
  subject: z.string().trim().min(3, "Write a subject line").max(150),
  body: z.string().trim().min(10, "Write the message").max(20_000),
});

/** Add a step to the sequence. */
export async function addAutomationStep(
  _prev: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  await requireSuperAdminAction();
  const parsed = stepSchema.safeParse({
    dayOffset: formData.get("dayOffset") ?? 0,
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    await systemDb((tx) => tx.emailAutomationStep.create({ data: parsed.data, select: { id: true } }));
  } catch {
    return { error: "Couldn't save. Run the automation migration, then retry." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Edit a step in place. Existing recipients keep their send record. */
export async function updateAutomationStep(
  _prev: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  await requireSuperAdminAction();
  const id = String(formData.get("id") ?? "");
  const parsed = stepSchema.safeParse({
    dayOffset: formData.get("dayOffset") ?? 0,
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    await systemDb((tx) =>
      tx.emailAutomationStep.updateMany({ where: { id }, data: parsed.data }),
    );
  } catch {
    return { error: "Couldn't save that step." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Pause or resume one step without deleting what it already sent. */
export async function toggleAutomationStep(formData: FormData): Promise<void> {
  await requireSuperAdminAction();
  const id = String(formData.get("id") ?? "");
  const enabled = formData.get("enabled") === "on";
  try {
    await systemDb((tx) => tx.emailAutomationStep.updateMany({ where: { id }, data: { enabled } }));
  } catch {
    /* not migrated yet */
  }
  revalidatePath(PATH);
}

/**
 * Delete a step. Its send records go with it — so re-adding the same step
 * later would email those leads again. Pausing is the safer default, which is
 * why the UI leads with the toggle.
 */
export async function deleteAutomationStep(formData: FormData): Promise<void> {
  await requireSuperAdminAction();
  const id = String(formData.get("id") ?? "");
  try {
    await systemDb((tx) => tx.emailAutomationStep.delete({ where: { id } }));
  } catch {
    /* already gone */
  }
  revalidatePath(PATH);
}

/** The master switch. Off means the nightly run sends nothing. */
export async function setAutomationEnabled(formData: FormData): Promise<void> {
  await requireSuperAdminAction();
  const enabled = formData.get("enabled") === "on";
  try {
    await systemDb((tx) =>
      tx.platformSetting.upsert({
        where: { id: "platform" },
        create: { id: "platform", emailAutomationOn: enabled },
        update: { emailAutomationOn: enabled },
      }),
    );
  } catch {
    /* not migrated yet */
  }
  revalidatePath(PATH);
}

/**
 * Send whatever is due right now instead of waiting for tonight's run. Useful
 * after adding a step, and for confirming the sequence works at all.
 */
export async function runAutomationNow(
  _prev: AutomationActionState,
  _formData: FormData,
): Promise<AutomationActionState> {
  await requireSuperAdminAction();
  const run = await runAutomation();
  revalidatePath(PATH);
  if (!run.enabled) return { error: "Turn the automation on first." };
  return { ok: true, run };
}
