import Link from "next/link";
import { manilaDate } from "@/lib/time/manila";
import type { OwnerNotice } from "@/lib/agent-portal/lapse";

/**
 * The warning before the sweep acts — and after. Renewal due soon, then the
 * date the account will be suspended, then suspended. Says what happens and
 * when, and that paying undoes it.
 */
export function AgentNotice({ notice, showLink = true }: { notice: OwnerNotice; showLink?: boolean }) {
  if (!notice) return null;
  const link = showLink ? (
    <Link href="/admin/billing" className="mt-2 inline-block font-semibold text-brand-primary">
      Upload your payment →
    </Link>
  ) : null;

  if (notice.kind === "renew_soon") {
    return (
      <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
        <p className="font-semibold">
          Your Servd subscription is paid until {manilaDate(new Date(notice.endsAt.getTime() - 1))} —{" "}
          {notice.daysLeft} day{notice.daysLeft === 1 ? "" : "s"} left.
        </p>
        <p className="mt-1 text-plum-ink/70">Pay the next month by bank transfer and upload the receipt to keep everything running.</p>
        {link}
      </div>
    );
  }
  if (notice.kind === "past_due") {
    return (
      <div className="rounded-tile border border-guava/40 bg-guava/10 p-4 text-sm text-plum-ink">
        <p className="font-semibold">
          Your Servd subscription ran out on {manilaDate(new Date(notice.endedAt.getTime() - 1))}.
        </p>
        <p className="mt-1 text-plum-ink/70">
          Your account will be paused on <strong>{manilaDate(notice.suspendsAt)}</strong>
          {notice.daysLeft > 0 ? ` (${notice.daysLeft} day${notice.daysLeft === 1 ? "" : "s"} from now)` : ""} unless a
          payment is received. Upload your receipt and everything carries on.
        </p>
        {link}
      </div>
    );
  }
  return (
    <div className="rounded-tile border border-guava/40 bg-guava/10 p-4 text-sm text-plum-ink">
      <p className="font-semibold">Your account is paused for non-payment.</p>
      <p className="mt-1 text-plum-ink/70">
        Upload a receipt for the overdue month — once it&apos;s confirmed, everything comes straight back. Your menu,
        orders and settings are all still here.
      </p>
      {link}
    </div>
  );
}
