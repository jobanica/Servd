"use client";

import { useActionState } from "react";
import { updateProgramSettings, type SettingsState } from "@/server/referrals/admin-actions";

export function ProgramSettingsForm({
  initial,
}: {
  initial: { track1CreditMonths: number; cookieDays: number; clawbackDays: number };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(updateProgramSettings, null);
  const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-wide text-plum-ink/50";

  return (
    <form action={action} className="grid max-w-xl gap-4 sm:grid-cols-3">
      <div>
        <label className={label}>Track-1 credit (months)</label>
        <input name="track1CreditMonths" type="number" min={0} max={12} defaultValue={initial.track1CreditMonths} className={field} />
      </div>
      <div>
        <label className={label}>Cookie window (days)</label>
        <input name="cookieDays" type="number" min={1} max={180} defaultValue={initial.cookieDays} className={field} />
      </div>
      <div>
        <label className={label}>Clawback window (days)</label>
        <input name="clawbackDays" type="number" min={0} max={365} defaultValue={initial.clawbackDays} className={field} />
      </div>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Save settings</button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      </div>
    </form>
  );
}
