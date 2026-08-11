"use client";

import { useActionState, useState } from "react";
import {
  addAutomationStep,
  updateAutomationStep,
  toggleAutomationStep,
  deleteAutomationStep,
  setAutomationEnabled,
  runAutomationNow,
  type AutomationActionState,
} from "@/server/email/automation-actions";
import { BUTTON_TAG } from "@/lib/email/render";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { AutomationStep } from "@/server/email/automation";

/**
 * The follow-up sequence. Set it once; it runs itself every night against
 * whoever is at that point in their journey.
 *
 * "Due now" is a dry run — it counts who would receive each step without
 * sending anything, so the sequence can be checked before it's switched on.
 */
export function EmailAutomation({
  enabled,
  steps,
  dueNow,
  catchUpDays,
}: {
  enabled: boolean;
  steps: AutomationStep[];
  dueNow: Record<number, number>;
  catchUpDays: number;
}) {
  const [runState, runAction] = useActionState<AutomationActionState, FormData>(
    runAutomationNow,
    null,
  );
  const [addState, addAction] = useActionState<AutomationActionState, FormData>(
    addAutomationStep,
    null,
  );
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Automated follow-up</h2>
          <p className="text-sm text-plum-ink/50">
            Counted from the day someone creates their preview. Stops by itself the moment they
            activate.
          </p>
        </div>
        <form action={setAutomationEnabled}>
          <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
          <button
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              enabled ? "bg-green-600 text-white" : "border border-plum-ink/15 text-plum-ink/60"
            }`}
          >
            {enabled ? "● Running" : "Paused"}
          </button>
        </form>
      </div>

      {/* Steps */}
      {steps.length === 0 ? (
        <p className="mt-4 rounded-lg bg-cream/60 px-3 py-3 text-sm text-plum-ink/55">
          No steps yet. Add the first one below — day 1 or 2 works well, while they still
          remember building it.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {steps.map((s) => (
            <li key={s.id} className="rounded-lg border border-plum-ink/10">
              {editing === s.id ? (
                <StepEditor step={s} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary">
                    Day {s.dayOffset}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${s.enabled ? "" : "text-plum-ink/40 line-through"}`}>
                    {s.subject}
                  </span>
                  {(dueNow[s.dayOffset] ?? 0) > 0 && (
                    <span className="rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">
                      {dueNow[s.dayOffset]} due now
                    </span>
                  )}
                  <span className="text-xs text-plum-ink/40">{s.sentCount} sent</span>
                  <button
                    type="button"
                    onClick={() => setEditing(s.id)}
                    className="text-xs font-semibold text-plum-ink/60 hover:text-brand-primary"
                  >
                    Edit
                  </button>
                  <form action={toggleAutomationStep}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="enabled" value={s.enabled ? "off" : "on"} />
                    <button className="text-xs font-semibold text-plum-ink/60 hover:text-brand-primary">
                      {s.enabled ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={deleteAutomationStep}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-xs text-muted hover:text-guava">Delete</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Run now */}
      {steps.length > 0 && (
        <form action={runAction} className="mt-3 flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Sending…" className="px-4 py-2">
            Send what&apos;s due now
          </SubmitButton>
          <span className="text-xs text-plum-ink/45">
            Runs automatically every night. A step stays sendable for {catchUpDays} days, so a
            missed night catches up.
          </span>
          {runState?.ok && runState.run && (
            <span className="text-sm text-green-700">
              Sent {runState.run.sent}
              {runState.run.failed > 0 ? ` · ${runState.run.failed} failed` : ""}.
            </span>
          )}
          {runState?.error && <span className="text-sm text-guava">{runState.error}</span>}
        </form>
      )}

      {/* Add */}
      <form action={addAction} className="mt-4 space-y-2 rounded-lg bg-cream/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">Add a step</p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-sm">
            Day
            <input
              name="dayOffset"
              type="number"
              min={0}
              max={365}
              defaultValue={1}
              className="w-16 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
            />
          </label>
          <input
            name="subject"
            placeholder="Subject line"
            className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </div>
        <textarea
          name="body"
          rows={5}
          placeholder={`Hi {{name}},\n\nYour page is still saved and ready.\n\n${BUTTON_TAG}`}
          className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 font-mono text-sm"
        />
        <p className="text-xs text-plum-ink/45">
          Same tags as a campaign — <code>{BUTTON_TAG}</code> for the activate button,{" "}
          <code>{"{{name}}"}</code> for the restaurant name.
        </p>
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel="Adding…" className="px-4 py-2">
            Add step
          </SubmitButton>
          {addState?.ok && <span className="text-sm text-green-700">Added.</span>}
          {addState?.error && <span className="text-sm text-guava">{addState.error}</span>}
        </div>
      </form>
    </div>
  );
}

function StepEditor({ step, onDone }: { step: AutomationStep; onDone: () => void }) {
  const [state, action] = useActionState<AutomationActionState, FormData>(
    updateAutomationStep,
    null,
  );
  if (state?.ok) onDone();

  return (
    <form action={action} className="space-y-2 p-3">
      <input type="hidden" name="id" value={step.id} />
      <div className="flex gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          Day
          <input
            name="dayOffset"
            type="number"
            min={0}
            max={365}
            defaultValue={step.dayOffset}
            className="w-16 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm"
          />
        </label>
        <input
          name="subject"
          defaultValue={step.subject}
          className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
      </div>
      <textarea
        name="body"
        rows={6}
        defaultValue={step.body}
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 font-mono text-sm"
      />
      <div className="flex items-center gap-3">
        <SubmitButton className="px-4 py-2">Save</SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-semibold text-muted hover:text-plum-ink"
        >
          Cancel
        </button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
      </div>
    </form>
  );
}
