import Link from "next/link";
import { PayNowButton } from "@/components/admin/PayNowButton";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";
import {
  ALL_ACCESS_FEATURES,
  ALL_ACCESS_GRACE_DAYS,
  suspendsAt,
} from "@/lib/billing/all-access";
import { FEATURE_META } from "@/lib/billing/features";

/**
 * The billing page for an account on the ₱800 All Access plan.
 *
 * Its own component rather than branches threaded through the existing page:
 * that page is what every grandfathered account sees — "buy a feature once,
 * no monthly subscription" — and it must keep rendering exactly as it did.
 *
 * Says one thing at a time, in order of urgency: suspended, then unpaid with
 * the date it suspends, then the trial countdown, then simply when the next
 * payment is. A monthly bill nobody is reminded of until the account stops
 * working is the failure this page exists to prevent.
 */

export interface AllAccessBillingProps {
  price: number; // centavos, read from the plan so an edit to it shows here
  status: "trialing" | "active" | "past_due" | "cancelled";
  suspended: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  /** When the unpaid month fell due (the open invoice's periodStart). */
  openInvoiceDueAt: Date | null;
  invoices: { id: string; createdAt: Date; amount: number; status: string }[];
  justPaid: boolean;
}

function daysUntil(d: Date): number {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

const INCLUDED = FEATURE_META.filter(
  (f) => ALL_ACCESS_FEATURES.includes(f.key) && !f.retired,
).map((f) => f.label);

export function AllAccessBilling(p: AllAccessBillingProps) {
  const price = formatPeso(p.price);
  const payLabel = `Pay ${price}`;
  const onTrial =
    p.status === "trialing" && !!p.trialEndsAt && p.trialEndsAt.getTime() > Date.now();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Billing</h1>
        <p className="text-sm text-plum-ink/50">
          All Access — {price} a month for every feature.
        </p>
      </div>

      {p.justPaid && !p.suspended && (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm font-semibold text-plum-ink">
          ✓ Payment received — thank you. It can take a minute to show below.
        </div>
      )}

      {p.suspended ? (
        <div className="rounded-tile border border-guava/40 bg-guava/10 p-5">
          <p className="font-heading text-lg font-bold text-plum-ink">Your account is paused</p>
          <p className="mt-1 text-sm text-plum-ink/70">
            {p.status === "cancelled"
              ? "Your subscription has ended, so your till, kitchen and ordering page are switched off."
              : `Your ${price} payment is overdue, so your till, kitchen and ordering page are switched off.`}{" "}
            Pay {price} and everything comes straight back — your menu, orders and settings are all
            still here.
          </p>
          <div className="mt-3"><PayNowButton label={payLabel} /></div>
        </div>
      ) : p.status === "past_due" ? (
        <div className="rounded-tile border border-guava/40 bg-guava/10 p-5">
          <p className="font-heading text-lg font-bold text-plum-ink">{price} is due</p>
          <p className="mt-1 text-sm text-plum-ink/70">
            {p.openInvoiceDueAt ? (
              <>
                Pay by <strong>{manilaDate(suspendsAt(p.openInvoiceDueAt))}</strong> to keep your
                account running.{" "}
                {(() => {
                  const d = daysUntil(suspendsAt(p.openInvoiceDueAt));
                  return d === 0
                    ? "That's today."
                    : `That's ${d} day${d === 1 ? "" : "s"} from now.`;
                })()}{" "}
                After that your till, kitchen and ordering page are paused until it&apos;s paid.
              </>
            ) : (
              <>
                You have {ALL_ACCESS_GRACE_DAYS} days to pay before your account is paused.
              </>
            )}
          </p>
          <div className="mt-3"><PayNowButton label={payLabel} /></div>
        </div>
      ) : onTrial && p.trialEndsAt ? (
        <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/5 p-5">
          <p className="font-heading text-lg font-bold text-brand-primary">
            ✨ {daysUntil(p.trialEndsAt)} day{daysUntil(p.trialEndsAt) === 1 ? "" : "s"} left in
            your free trial
          </p>
          <p className="mt-1 text-sm text-plum-ink/70">
            Everything is unlocked. Your trial ends on{" "}
            <strong>{manilaDate(p.trialEndsAt)}</strong>; after that it&apos;s {price} a month to
            keep it. You can pay now — your first month starts when the trial ends, so you
            don&apos;t lose any free days.
          </p>
          <div className="mt-3"><PayNowButton label={`Pay ${price} now`} /></div>
        </div>
      ) : (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
          <p className="font-heading text-lg font-bold">You&apos;re all paid up</p>
          <p className="mt-1 text-sm text-plum-ink/70">
            {p.currentPeriodEnd ? (
              <>
                Your next payment of {price} is due on{" "}
                <strong>{manilaDate(p.currentPeriodEnd)}</strong>. We&apos;ll put the bill here
                and you&apos;ll have {ALL_ACCESS_GRACE_DAYS} days to pay it.
              </>
            ) : (
              <>{price} a month.</>
            )}
          </p>
        </div>
      )}

      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">What&apos;s included</h2>
        <p className="mt-1 text-sm text-plum-ink/60">
          Everything below, plus QR ordering, the cashier, the kitchen display and your
          ordering page.
        </p>
        <ul className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {INCLUDED.map((label) => (
            <li key={label} className="flex items-start gap-2">
              <span className="text-brand-primary">✓</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
        {/* The one thing not in the price, said where the price is. */}
        <p className="mt-4 border-t border-plum-ink/10 pt-3 text-sm text-plum-ink/60">
          The <strong>Content Calendar</strong> is separate, with its own monthly price.{" "}
          <Link href="/admin/content" className="font-semibold text-brand-primary underline">
            See the Content Calendar
          </Link>
        </p>
      </div>

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Payment history</h2>
        {p.invoices.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No payments yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr><th className="py-2">Date</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {p.invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-plum-ink/10">
                  <td className="py-2">{manilaDate(inv.createdAt)}</td>
                  <td>{formatPeso(inv.amount)}</td>
                  <td>{inv.status === "open" ? "due" : inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
