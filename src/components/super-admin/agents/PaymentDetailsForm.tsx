"use client";

import { useActionState } from "react";
import { savePaymentDetails, type AdminFormState } from "@/server/agent-portal/admin-actions";
import type { PaymentDetails } from "@/server/agent-portal/billing";

const field = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

/** The platform-wide "where to pay" block agent-referred owners see. */
export function PaymentDetailsForm({ initial }: { initial: PaymentDetails }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePaymentDetails, null);
  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        {initial.qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initial.qrUrl} alt="Current payment QR" className="h-32 w-32 rounded-lg border border-plum-ink/10 object-contain" />
        )}
        <div className="text-sm">
          <label className="font-medium">
            Payment QR
            <input type="file" name="qr" accept="image/png,image/jpeg,image/webp" className="mt-1 block text-sm" />
          </label>
          {initial.qrUrl && (
            <label className="mt-2 flex items-center gap-2 text-xs text-plum-ink/60">
              <input type="checkbox" name="removeQr" /> Remove the current QR
            </label>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">GCash number<input name="gcashNumber" defaultValue={initial.gcash?.number ?? ""} className={field} /></label>
        <label className="text-sm font-medium">GCash name<input name="gcashName" defaultValue={initial.gcash?.name ?? ""} className={field} /></label>
        <label className="text-sm font-medium">Maya number<input name="mayaNumber" defaultValue={initial.maya?.number ?? ""} className={field} /></label>
        <label className="text-sm font-medium">Maya name<input name="mayaName" defaultValue={initial.maya?.name ?? ""} className={field} /></label>
        <label className="text-sm font-medium">Bank<input name="bankName" defaultValue={initial.bank?.bank ?? ""} className={field} /></label>
        <label className="text-sm font-medium">Account name<input name="bankAccountName" defaultValue={initial.bank?.name ?? ""} className={field} /></label>
        <label className="text-sm font-medium">Account number<input name="bankAccountNumber" defaultValue={initial.bank?.number ?? ""} className={field} /></label>
      </div>
      <label className="block text-sm font-medium">
        Note to owners
        <textarea name="note" rows={2} defaultValue={initial.note ?? ""} className={field} />
      </label>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm font-semibold text-plum-ink">✓ {state.message}</p>}
      <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand disabled:opacity-60">
        {pending ? "Saving…" : "Save payment details"}
      </button>
    </form>
  );
}
