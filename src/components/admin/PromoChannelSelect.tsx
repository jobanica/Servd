"use client";

import { setPromotionChannel } from "@/server/promotions/actions";
import { PROMO_CHANNEL_OPTIONS } from "@/lib/promotions/channel";

/** Where an existing promotion applies — saves as soon as it's changed. */
export function PromoChannelSelect({ id, channel }: { id: string; channel: string | null }) {
  return (
    <form action={setPromotionChannel}>
      <input type="hidden" name="id" value={id} />
      <select
        name="channel"
        defaultValue={channel ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Where it applies"
        className="rounded-lg border border-plum-ink/15 bg-white px-2 py-1 text-xs"
      >
        {PROMO_CHANNEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
