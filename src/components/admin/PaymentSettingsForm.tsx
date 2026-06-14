"use client";

import { useActionState } from "react";
import { updatePaymentSettings, type FormState } from "@/server/payments/settings";
import { SubmitButton } from "./SubmitButton";

export function PaymentSettingsForm({
  initial,
  webhookUrl,
}: {
  initial: { enabled: boolean; configured: boolean };
  webhookUrl: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(
    updatePaymentSettings,
    null,
  );

  return (
    <form
      action={action}
      className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      <p className="text-sm text-plum-ink/60">
        Connect your <strong>own</strong> PayMongo account — payments go straight
        to you. Servd never holds your funds.{" "}
        {initial.configured ? (
          <span className="font-semibold text-mango">Keys are saved.</span>
        ) : (
          <span className="font-semibold text-guava">Not configured yet.</span>
        )}
      </p>

      <div>
        <label className="block text-sm font-semibold">PayMongo secret key</label>
        <input
          name="secretKey"
          type="password"
          placeholder={initial.configured ? "•••••• (leave blank to keep)" : "sk_live_…"}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold">Webhook signing secret</label>
        <input
          name="webhookSecret"
          type="password"
          placeholder={initial.configured ? "•••••• (leave blank to keep)" : "whsk_…"}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
        <p className="mt-1 text-xs text-plum-ink/50">
          Add this webhook URL in your PayMongo dashboard:
        </p>
        <code className="mt-1 block break-all rounded-lg bg-cream px-3 py-2 text-xs">
          {webhookUrl}
        </code>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} />
        Enable online payment (GCash &amp; card) for diners
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save payment settings</SubmitButton>
    </form>
  );
}
