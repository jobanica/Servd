"use client";

import { useActionState } from "react";
import { updateProgramSettings, type SettingsState } from "@/server/referrals/admin-actions";

export interface ProgramSettingsInitial {
  track1CreditMonths: number;
  cookieDays: number;
  clawbackDays: number;
  commissionPctYear1: number;
  commissionPctOngoing: number;
  track2DurationMonths: number;
  payoutModel: string;
  bountyAmountPesos: number;
  minPayoutPesos: number;
}

export function ProgramSettingsForm({ initial }: { initial: ProgramSettingsInitial }) {
  const [state, action] = useActionState<SettingsState, FormData>(updateProgramSettings, null);
  const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-wide text-plum-ink/50";

  return (
    <form action={action} className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-bold">Track 1 — restaurant referrals</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Credit (months)</label>
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
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold">Track 2 — partners</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Year-1 commission %</label>
            <input name="commissionPctYear1" type="number" min={0} max={100} defaultValue={initial.commissionPctYear1} className={field} />
          </div>
          <div>
            <label className={label}>Ongoing % (for life)</label>
            <input name="commissionPctOngoing" type="number" min={0} max={100} defaultValue={initial.commissionPctOngoing} className={field} />
          </div>
          <div>
            <label className={label}>Year-1 length (months)</label>
            <input name="track2DurationMonths" type="number" min={0} max={60} defaultValue={initial.track2DurationMonths} className={field} />
          </div>
          <div>
            <label className={label}>Payout model</label>
            <select name="payoutModel" defaultValue={initial.payoutModel} className={field}>
              <option value="recurring">Recurring %</option>
              <option value="bounty">One-time bounty</option>
            </select>
          </div>
          <div>
            <label className={label}>Bounty (₱)</label>
            <input name="bountyAmount" type="number" min={0} step="0.01" defaultValue={initial.bountyAmountPesos} className={field} />
          </div>
          <div>
            <label className={label}>Min payout (₱)</label>
            <input name="minPayout" type="number" min={0} step="0.01" defaultValue={initial.minPayoutPesos} className={field} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Save settings</button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      </div>
    </form>
  );
}
