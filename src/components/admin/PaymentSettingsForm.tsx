"use client";

import { useActionState, useState } from "react";
import { updatePaymentSettings, type FormState } from "@/server/payments/settings";
import { SubmitButton } from "./SubmitButton";

type GatewayKey = "paymongo" | "xendit";

const GATEWAYS: Record<
  GatewayKey,
  {
    label: string;
    blurb: string;
    secretLabel: string;
    secretPlaceholder: string;
    webhookLabel: string;
    webhookPlaceholder: string;
    webhookHelp: string;
  }
> = {
  paymongo: {
    label: "PayMongo",
    blurb: "Connect your own PayMongo account — payments go straight to you.",
    secretLabel: "PayMongo secret key",
    secretPlaceholder: "sk_live_…",
    webhookLabel: "Webhook signing secret",
    webhookPlaceholder: "whsk_…",
    webhookHelp: "Add this webhook URL in your PayMongo dashboard:",
  },
  xendit: {
    label: "Xendit",
    blurb: "Connect your own Xendit account — payments go straight to you.",
    secretLabel: "Xendit secret API key",
    secretPlaceholder: "xnd_production_…",
    webhookLabel: "Webhook verification token",
    webhookPlaceholder: "Your Xendit callback token",
    webhookHelp:
      "In Xendit → Settings → Webhooks, set the Invoices-paid URL below and paste your callback verification token above:",
  },
};

export function PaymentSettingsForm({
  initial,
  webhookBase,
  restaurantId,
}: {
  initial: { enabled: boolean; configured: boolean; gateway: GatewayKey };
  webhookBase: string; // e.g. https://app/api/webhooks
  restaurantId: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(updatePaymentSettings, null);
  const [gateway, setGateway] = useState<GatewayKey>(initial.gateway);
  const g = GATEWAYS[gateway];
  const webhookUrl = `${webhookBase}/${gateway}/${restaurantId}`;

  return (
    <form
      action={action}
      className="max-w-xl space-y-5 rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      {/* Provider picker */}
      <div>
        <label className="block text-sm font-semibold">Payment provider</label>
        <div className="mt-2 flex gap-2">
          {(Object.keys(GATEWAYS) as GatewayKey[]).map((key) => (
            <label
              key={key}
              className={`flex-1 cursor-pointer rounded-lg border px-4 py-2.5 text-center text-sm font-semibold ${
                gateway === key
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                  : "border-plum-ink/15 text-plum-ink/70"
              }`}
            >
              <input
                type="radio"
                name="gateway"
                value={key}
                checked={gateway === key}
                onChange={() => setGateway(key)}
                className="hidden"
              />
              {GATEWAYS[key].label}
            </label>
          ))}
        </div>
      </div>

      <p className="text-sm text-plum-ink/60">
        {g.blurb} Servd never holds your funds.{" "}
        {initial.configured ? (
          <span className="font-semibold text-mango">Keys are saved.</span>
        ) : (
          <span className="font-semibold text-guava">Not configured yet.</span>
        )}
      </p>

      <div>
        <label className="block text-sm font-semibold">{g.secretLabel}</label>
        <input
          name="secretKey"
          type="password"
          placeholder={initial.configured ? "•••••• (leave blank to keep)" : g.secretPlaceholder}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold">{g.webhookLabel}</label>
        <input
          name="webhookSecret"
          type="password"
          placeholder={initial.configured ? "•••••• (leave blank to keep)" : g.webhookPlaceholder}
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
        <p className="mt-1 text-xs text-plum-ink/50">{g.webhookHelp}</p>
        <code className="mt-1 block break-all rounded-lg bg-cream px-3 py-2 text-xs">
          {webhookUrl}
        </code>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={initial.enabled} />
        Enable online payment (GCash &amp; card) for diners
      </label>

      {gateway !== initial.gateway && (
        <p className="text-xs text-plum-ink/50">
          Switching providers — enter your {g.label} keys above before saving.
        </p>
      )}
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save payment settings</SubmitButton>
    </form>
  );
}
