"use client";

import { useActionState, useState } from "react";
import { updateProgramSettings, type SettingsState } from "@/server/referrals/admin-actions";

export interface BonusTierInput {
  activeReferrals: number;
  amountPesos: number;
}

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
  withholdingPct: number;
  bonusTiers: BonusTierInput[];
}

export function ProgramSettingsForm({ initial }: { initial: ProgramSettingsInitial }) {
  const [state, action] = useActionState<SettingsState, FormData>(updateProgramSettings, null);
  const [tiers, setTiers] = useState<BonusTierInput[]>(initial.bonusTiers);
  const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-wide text-plum-ink/50";

  const setTier = (i: number, patch: Partial<BonusTierInput>) =>
    setTiers((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addTier = () => setTiers((ts) => [...ts, { activeReferrals: 0, amountPesos: 0 }]);
  const removeTier = (i: number) => setTiers((ts) => ts.filter((_, idx) => idx !== i));

  return (
    <form action={action} className="space-y-5">
      {/* Bonus tiers are managed in React state; serialize for the action. */}
      <input type="hidden" name="bonusTiers" value={JSON.stringify(tiers)} />
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

      {/* Milestone bonuses */}
      <div>
        <p className="mb-2 text-sm font-bold">Milestone bonuses</p>
        <p className="mb-2 text-xs text-plum-ink/50">
          One-time bonuses when a partner&apos;s active paying referrals reach each milestone. They
          stack and are earned once.
        </p>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <label className="text-xs text-plum-ink/50">At</label>
              <input
                type="number"
                min={1}
                value={t.activeReferrals}
                onChange={(e) => setTier(i, { activeReferrals: Number(e.target.value) })}
                className="w-24 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-plum-ink/50">active referrals →</span>
              <span className="text-plum-ink/50">₱</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={t.amountPesos}
                onChange={(e) => setTier(i, { amountPesos: Number(e.target.value) })}
                className="w-32 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeTier(i)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-guava hover:bg-guava/10"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addTier}
          className="mt-2 rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
        >
          + Add tier
        </button>
      </div>

      {/* Compliance */}
      <div>
        <p className="mb-2 text-sm font-bold">Compliance</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label}>Withholding % (payout statements)</label>
            <input name="withholdingPct" type="number" min={0} max={100} defaultValue={initial.withholdingPct} className={field} />
          </div>
        </div>
        <p className="mt-1 text-xs text-plum-ink/45">
          Applied to payout statements for record-keeping. Not tax advice — confirm the correct PH
          rate with an accountant.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Save settings</button>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      </div>
    </form>
  );
}
