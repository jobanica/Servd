"use client";

import { useActionState } from "react";
import { attachAgentCode, type AdminFormState } from "@/server/agent-portal/admin-actions";

const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

/** Add-only: a code can be attached once and never changed. */
export function AttachAgentCodeForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(attachAgentCode, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">
        Restaurant slug or ID
        <input name="restaurant" required className={field} />
      </label>
      <label className="text-sm font-medium">
        Agent code
        <input name="agentCode" required className={`${field} font-mono uppercase`} />
      </label>
      <label className="text-sm font-medium">
        Owner name
        <input name="ownerName" required className={field} />
      </label>
      <label className="text-sm font-medium">
        Owner phone <span className="font-normal text-plum-ink/50">(blank = the one on their receipts)</span>
        <input name="ownerPhone" type="tel" className={field} />
      </label>
      <div className="sm:col-span-2">
        <p className="text-xs text-plum-ink/50">
          Permanent once saved. The restaurant then pays through the agent portal (agreement, transfer, receipt)
          instead of Servd&apos;s own billing.
        </p>
        {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="mt-2 text-sm font-semibold text-plum-ink">✓ {state.message}</p>}
        <button type="submit" disabled={pending} className="mt-2 rounded-lg px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60">
          {pending ? "Attaching…" : "Attach code"}
        </button>
      </div>
    </form>
  );
}
