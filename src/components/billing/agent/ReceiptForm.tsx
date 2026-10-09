"use client";

import { useActionState, useState } from "react";
import { submitReceipt, type ReceiptFormState } from "@/server/agent-portal/owner-actions";

export interface ReceiptFormProps {
  /** Activation is only offered while it can still be sent. */
  activationOpen: boolean;
  suggestedMonth: string; // "YYYY-MM"
  /** Pesos, from the portal's terms — a prefill, still editable. */
  activationFee: number | null;
  monthlyFee: number | null;
}

const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2";

export function ReceiptForm(p: ReceiptFormProps) {
  const [state, action, pending] = useActionState<ReceiptFormState, FormData>(submitReceipt, { status: "idle" });
  const [type, setType] = useState<"activation" | "monthly">(p.activationOpen ? "activation" : "monthly");
  const [months, setMonths] = useState(1);
  const prefill =
    type === "activation"
      ? p.activationFee
      : p.monthlyFee != null
        ? p.monthlyFee * months
        : null;

  if (state.status === "done") {
    return (
      <div className="rounded-lg border border-mango/40 bg-mango/10 p-4 text-sm font-semibold text-plum-ink">
        ✓ {state.message}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">This payment is for</label>
        <div className="mt-1 flex gap-2">
          {p.activationOpen && (
            <button
              type="button"
              onClick={() => setType("activation")}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${type === "activation" ? "border-brand-primary bg-brand-primary/10 text-brand-primary" : "border-plum-ink/15"}`}
            >
              Activation
            </button>
          )}
          <button
            type="button"
            onClick={() => setType("monthly")}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${type === "monthly" ? "border-brand-primary bg-brand-primary/10 text-brand-primary" : "border-plum-ink/15"}`}
          >
            Monthly subscription
          </button>
        </div>
        <input type="hidden" name="type" value={type} />
      </div>

      {type === "monthly" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            First month
            <input type="month" name="billing_month_start" defaultValue={p.suggestedMonth} required className={field} />
          </label>
          <label className="text-sm font-medium">
            Months paid
            <select
              name="months_covered"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className={field}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <label className="block text-sm font-medium">
        Amount paid (₱)
        <input
          key={`${type}-${months}`}
          name="amount"
          inputMode="decimal"
          required
          defaultValue={prefill != null ? String(prefill) : ""}
          className={field}
        />
      </label>

      <label className="block text-sm font-medium">
        Bank / GCash reference number
        <input name="bank_reference" required minLength={3} maxLength={100} className={`${field} font-mono`} />
      </label>

      <label className="block text-sm font-medium">
        Receipt screenshot
        <input
          type="file"
          name="receipt"
          accept="image/jpeg,image/png,image/webp"
          required
          className="mt-1 block w-full text-sm"
        />
        <span className="mt-1 block text-xs text-plum-ink/50">JPEG, PNG or WebP, under 4 MB.</span>
      </label>

      {state.status === "error" && <p className="text-sm text-guava">{state.message}</p>}

      <button type="submit" disabled={pending} className="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60">
        {pending ? "Sending…" : "Send receipt"}
      </button>
    </form>
  );
}
