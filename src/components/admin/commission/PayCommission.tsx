"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPeso } from "@/lib/money";
import { prepareReceipt } from "@/lib/images/receipt";
import { submitCommissionPayment } from "@/server/neighborhood/partner-actions";

interface Details {
  qrUrl: string | null;
  gcash: { name: string; number: string } | null;
  maya: { name: string; number: string } | null;
  bank: { bank: string; name: string; number: string } | null;
  note: string | null;
}

/**
 * "Pay commission": Servd's bank QR and account details, then the receipt.
 * The payment goes to Servd to confirm; nothing is marked paid until then.
 */
export function PayCommission({ amountDue, details }: { amountDue: number; details: Details }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(amountDue > 0 ? (amountDue / 100).toFixed(2) : "");
  const [reference, setReference] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const hasDetails = !!(details.qrUrl || details.bank || details.gcash || details.maya);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const r = await prepareReceipt(file);
    if (r.dataUrl) setReceipt(r.dataUrl);
    else setError(r.error ?? "Couldn't read that image.");
  }

  async function submit() {
    const centavos = Math.round(Number(amount.replace(/[₱,\s]/g, "")) * 100);
    if (!Number.isFinite(centavos) || centavos <= 0) return setError("Enter the amount you paid.");
    if (!receipt) return setError("Upload the receipt first.");
    setBusy(true);
    setError(null);
    const r = await submitCommissionPayment({ amount: centavos, reference, receipt });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSent(true);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setSent(false);
    setReceipt(null);
    setReference("");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-brand-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm"
      >
        💳 Pay commission
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={busy ? undefined : close}>
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <div className="py-6 text-center">
                <p className="text-4xl">✅</p>
                <h2 className="mt-2 font-heading text-xl font-extrabold">Receipt sent</h2>
                <p className="mt-1 text-sm text-plum-ink/60">
                  Servd will check it and confirm. It will show as paid here once confirmed.
                </p>
                <button type="button" onClick={close} className="mt-5 rounded-full px-6 py-2.5 text-sm font-semibold btn-brand">
                  Done
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-heading text-xl font-extrabold">Pay commission</h2>
                <p className="text-sm text-plum-ink/60">
                  {amountDue > 0 ? (
                    <>Amount due: <strong className="text-plum-ink">{formatPeso(amountDue)}</strong></>
                  ) : (
                    "Nothing is due right now — you can still pay ahead."
                  )}
                </p>

                <div className="mt-4 rounded-2xl border border-plum-ink/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/50">1 · Pay Servd</p>
                  {!hasDetails ? (
                    <p className="mt-2 text-sm text-plum-ink/60">Servd hasn&apos;t set up its bank details yet. Please message Servd for where to pay.</p>
                  ) : (
                    <div className="mt-2 space-y-2 text-sm">
                      {details.qrUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={details.qrUrl} alt="Servd payment QR" className="mx-auto h-56 w-56 rounded-xl border border-plum-ink/10 object-contain" />
                      )}
                      {details.bank && (
                        <p><span className="text-plum-ink/50">Bank:</span> <strong>{details.bank.bank}</strong> · {details.bank.name} · <span className="font-mono">{details.bank.number}</span></p>
                      )}
                      {details.gcash && (
                        <p><span className="text-plum-ink/50">GCash:</span> {details.gcash.name} · <span className="font-mono">{details.gcash.number}</span></p>
                      )}
                      {details.maya && (
                        <p><span className="text-plum-ink/50">Maya:</span> {details.maya.name} · <span className="font-mono">{details.maya.number}</span></p>
                      )}
                      {details.note && <p className="text-xs text-plum-ink/60">{details.note}</p>}
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-2xl border border-plum-ink/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/50">2 · Upload your receipt</p>
                  <label className="mt-2 block text-sm">
                    <span className="text-xs font-semibold text-plum-ink/60">Amount paid (₱)</span>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
                    />
                  </label>
                  <label className="mt-2 block text-sm">
                    <span className="text-xs font-semibold text-plum-ink/60">Reference number (optional)</span>
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
                    />
                  </label>
                  {receipt ? (
                    <div className="mt-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={receipt} alt="Your receipt" className="h-20 w-20 rounded-lg border object-cover" />
                      <label className="cursor-pointer text-sm font-semibold text-brand-primary">
                        Change
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                      </label>
                    </div>
                  ) : (
                    <label className="mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-brand-primary/40 bg-brand-primary/5 py-5 text-sm font-bold text-brand-primary">
                      📎 Choose the receipt screenshot
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                    </label>
                  )}
                </div>

                {error && <p className="mt-3 text-sm font-semibold text-guava">{error}</p>}
                <button
                  type="button"
                  disabled={busy || !receipt}
                  onClick={submit}
                  className="mt-4 w-full rounded-xl bg-brand-primary py-3 text-base font-bold text-white disabled:opacity-40"
                >
                  {busy ? "Sending…" : "Send receipt to Servd"}
                </button>
                <button type="button" disabled={busy} onClick={close} className="mt-1 w-full py-2 text-sm font-semibold text-plum-ink/50">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
