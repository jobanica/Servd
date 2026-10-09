import Link from "next/link";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";
import type { AgentBillingState, PaymentDetails } from "@/server/agent-portal/billing";
import { hasPaymentMethod } from "@/server/agent-portal/billing";
import { SignAgreementButton } from "./SignAgreementButton";
import { ReceiptForm } from "./ReceiptForm";
import { AgentNotice } from "./AgentNotice";

/**
 * Billing for a restaurant that came through a CANVEXIA sales agent: paid by
 * bank transfer and an uploaded receipt, confirmed by the portal.
 *
 * Laid out in the order the owner works: sign → scan → pay → upload. Where to
 * pay appears only once the agreement is signed, directly above the receipt
 * form. The amount due is the portal's — read from it on each visit, never
 * stored here — and only prefills the field.
 */
export function AgentBilling({ s }: { s: AgentBillingState }) {
  const toPesos = (c: number | null | undefined) => (c != null ? Math.round(c) / 100 : null);
  const activationFee = toPesos(s.terms?.activation_fee);
  const monthlyFee = toPesos(s.terms?.monthly_fee);
  const pendingReview = s.payments.filter((p) => p.status === "submitted");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Billing</h1>
        <p className="text-sm text-plum-ink/50">Paid by bank transfer — upload your receipt and we confirm it.</p>
      </div>

      <AgentNotice notice={s.notice} showLink={false} />

      {/* 1. Sign */}
      <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading font-bold">1. Service agreement</h2>
        {s.contractSigned ? (
          <p className="mt-1 text-sm text-plum-ink/70">
            ✓ Signed{s.contractSignedAt ? ` on ${manilaDate(s.contractSignedAt)}` : ""}.
            {s.minimumTermEndsAt ? ` Minimum term ends ${manilaDate(s.minimumTermEndsAt)}.` : ""}
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-plum-ink/70">
              Sign the agreement first. It opens on our agents&apos; portal and comes back here when you&apos;re done.
            </p>
            <div className="mt-3"><SignAgreementButton /></div>
          </>
        )}
      </section>

      {s.contractSigned && (
        <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <h2 className="font-heading font-bold">2. Pay</h2>
          {s.terms && (activationFee != null || monthlyFee != null) && (
            <p className="mt-1 text-sm text-plum-ink/70">
              {!s.terms.activation_confirmed && activationFee != null && (
                <>Activation: <strong>{formatPeso(activationFee * 100)}</strong> (one time). </>
              )}
              {monthlyFee != null && <>Monthly: <strong>{formatPeso(monthlyFee * 100)}</strong>.</>}
            </p>
          )}
          {hasPaymentMethod(s.paymentDetails) ? (
            <PayTo d={s.paymentDetails} />
          ) : (
            <p className="mt-2 text-sm text-plum-ink/60">
              Payment details are being set up — please check back shortly.
            </p>
          )}

          {hasPaymentMethod(s.paymentDetails) && (
            <div className="mt-5 border-t border-plum-ink/10 pt-5">
              <h2 className="font-heading font-bold">3. Upload your receipt</h2>
              {!s.portalConfigured ? (
                <p className="mt-1 text-sm text-plum-ink/60">Receipts can&apos;t be sent yet. Please try again later.</p>
              ) : (
                <div className="mt-3">
                  <ReceiptForm
                    activationOpen={s.canSubmitActivation}
                    suggestedMonth={s.suggestedMonth}
                    activationFee={activationFee}
                    monthlyFee={monthlyFee}
                  />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {pendingReview.length > 0 && (
        <p className="text-sm text-plum-ink/60">
          {pendingReview.length} receipt{pendingReview.length === 1 ? "" : "s"} waiting for confirmation.
        </p>
      )}

      {s.payments.length > 0 && (
        <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <h2 className="font-heading font-bold">Your payments</h2>
          <ul className="mt-2 divide-y divide-plum-ink/5 text-sm">
            {s.payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                <span>
                  <span className="font-semibold">
                    {p.type === "activation"
                      ? "Activation"
                      : `${p.monthsCovered} month${p.monthsCovered === 1 ? "" : "s"} from ${p.billingMonth}`}
                  </span>
                  <span className="block font-mono text-xs text-plum-ink/50">{p.bankReference}</span>
                  {p.reason && <span className="block text-xs text-guava">{p.reason}</span>}
                </span>
                <span className="text-right">
                  {formatPeso(p.amountCentavos)}
                  <span className="block text-xs text-plum-ink/50">{STATUS_LABEL[p.status] ?? p.status}</span>
                </span>
              </li>
            ))}
          </ul>
          {s.coverage.paidUntil && (
            <p className="mt-2 text-xs text-plum-ink/50">
              Paid through {manilaDate(new Date(s.coverage.paidUntil.getTime() - 1))}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  submitted: "Waiting for confirmation",
  confirmed: "Confirmed",
  rejected: "Not accepted",
  reversed: "Reversed",
};

function PayTo({ d }: { d: PaymentDetails }) {
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-[auto,1fr]">
      {d.qrUrl && (
        // A plain <img>, not next/image: the QR lives in object storage, and
        // its pixels must reach the phone camera unresampled.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={d.qrUrl}
          alt="Payment QR code"
          className="h-48 w-48 rounded-lg border border-plum-ink/10 bg-white object-contain"
          style={{ imageRendering: "pixelated" }}
        />
      )}
      <dl className="space-y-2 text-sm">
        {d.gcash && <Method label="GCash" lines={[d.gcash.number, d.gcash.name]} />}
        {d.maya && <Method label="Maya" lines={[d.maya.number, d.maya.name]} />}
        {d.bank && <Method label={d.bank.bank} lines={[d.bank.number, d.bank.name]} />}
        {d.note && <p className="text-plum-ink/60">{d.note}</p>}
      </dl>
    </div>
  );
}

function Method({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-plum-ink/50">{label}</dt>
      {lines.filter(Boolean).map((l, i) => (
        <dd key={i} className={i === 0 ? "font-mono font-semibold" : "text-plum-ink/70"}>{l}</dd>
      ))}
    </div>
  );
}
