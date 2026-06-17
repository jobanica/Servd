import { listSubscriptions, listAllPlans, type SubStatus } from "@/server/billing/super-admin";
import {
  assignPlan,
  setSubscriptionStatus,
  extendTrial,
  compMonth,
  setRestaurantAccess,
} from "@/server/billing/super-admin-actions";
import { addSmsCredits, setSenderName } from "@/server/sms/admin";
import { formatPeso } from "@/lib/money";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-mango/15 text-mango",
  trialing: "bg-brand-primary/10 text-brand-primary",
  past_due: "bg-guava/15 text-guava",
  cancelled: "bg-plum-ink/10 text-plum-ink/50",
};

function StatusBadge({ status }: { status: SubStatus | null }) {
  if (!status) return <span className="text-plum-ink/40">no sub</span>;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? ""}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

export default async function SubscriptionsPage() {
  const [subs, plans] = await Promise.all([listSubscriptions(), listAllPlans()]);
  const activePlans = plans.filter((p) => p.isActive);

  const field = "rounded border border-plum-ink/15 px-2 py-1 text-xs";
  const btn = "rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold hover:bg-cream";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">Subscriptions</h1>
        <p className="text-sm text-plum-ink/50">
          {subs.length} restaurants. Change plans, force status, extend trials, comp months or
          suspend access.
        </p>
      </div>

      <div className="space-y-3">
        {subs.map((s) => (
          <details key={s.restaurantId} className="rounded-tile border border-plum-ink/10 bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-[180px]">
                <p className="font-semibold">{s.restaurantName}</p>
                <p className="text-xs text-plum-ink/40">/{s.slug}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-plum-ink/60">
                <StatusBadge status={s.status} />
                {s.restaurantStatus === "suspended" && (
                  <span className="rounded-full bg-guava/15 px-2 py-0.5 font-semibold text-guava">
                    suspended
                  </span>
                )}
              </div>
              <div className="text-sm">{s.planName ?? "—"}</div>
              <div className="text-sm font-semibold">{formatPeso(s.priceMonthly)}/mo</div>
              <div className="text-xs text-plum-ink/50">
                {s.status === "trialing"
                  ? `trial ends ${fmtDate(s.trialEndsAt)}`
                  : `renews ${fmtDate(s.currentPeriodEnd)}`}
              </div>
            </summary>

            <div className="grid gap-4 border-t border-plum-ink/10 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Plan */}
              <form action={assignPlan} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Plan</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <select name="planId" defaultValue={s.planId ?? ""} className={field}>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {formatPeso(p.priceMonthly)}
                      </option>
                    ))}
                  </select>
                  <button className={btn}>Assign</button>
                </div>
              </form>

              {/* Status */}
              <form action={setSubscriptionStatus} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Status</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <select name="status" defaultValue={s.status ?? "active"} className={field}>
                    <option value="active">active</option>
                    <option value="trialing">trialing</option>
                    <option value="past_due">past due</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                  <button className={btn}>Set</button>
                </div>
              </form>

              {/* Extend trial */}
              <form action={extendTrial} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Extend trial</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <input name="days" type="number" min="1" max="365" defaultValue="14" className={`${field} w-16`} />
                  <span className="self-center text-xs text-plum-ink/40">days</span>
                  <button className={btn}>Extend</button>
                </div>
              </form>

              {/* Comp + access */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">Actions</label>
                <div className="flex flex-wrap gap-1">
                  <form action={compMonth}>
                    <input type="hidden" name="restaurantId" value={s.restaurantId} />
                    <button className={btn}>Comp 1 month</button>
                  </form>
                  <form action={setRestaurantAccess}>
                    <input type="hidden" name="restaurantId" value={s.restaurantId} />
                    <input
                      type="hidden"
                      name="access"
                      value={s.restaurantStatus === "suspended" ? "active" : "suspended"}
                    />
                    <button className={btn}>
                      {s.restaurantStatus === "suspended" ? "Restore access" : "Suspend access"}
                    </button>
                  </form>
                </div>
                {s.failedCharges > 0 && (
                  <p className="text-[11px] text-guava">{s.failedCharges} failed charge(s)</p>
                )}
              </div>

              {/* SMS credits */}
              <form action={addSmsCredits} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">
                  SMS credits ({s.smsCreditBalance})
                </label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <input name="amount" type="number" min="1" placeholder="100" className={`${field} w-20`} />
                  <button className={btn}>Add</button>
                </div>
              </form>

              {/* Sender name */}
              <form action={setSenderName} className="space-y-1">
                <label className="text-[11px] font-semibold uppercase text-plum-ink/40">SMS sender</label>
                <input type="hidden" name="restaurantId" value={s.restaurantId} />
                <div className="flex gap-1">
                  <input
                    name="senderName"
                    defaultValue={s.smsSenderName ?? ""}
                    maxLength={11}
                    placeholder="SENDER"
                    className={`${field} w-24`}
                  />
                  <button className={btn}>Set</button>
                </div>
              </form>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
