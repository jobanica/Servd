"use client";

import { useActionState } from "react";
import { scanPartnerDemoMenu, type DemoScanState } from "@/server/partners/demo";

export function PartnerScanMenuForm({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState<DemoScanState, FormData>(scanPartnerDemoMenu, null);
  return (
    <form action={action} className="rounded-tile border border-brand-primary/25 bg-brand-primary/5 p-4">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <p className="font-heading font-bold text-plum-ink">✨ Scan a menu (photo or PDF)</p>
      <p className="text-xs text-plum-ink/55">
        Upload <strong>one</strong> photo or PDF of the prospect&apos;s printed menu — AI reads it
        and fills in the categories &amp; items for you (edit after). JPEG / PNG / WebP / PDF.
        Pick the clearest shot; you can scan again to add more.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input name="images" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-xs" />
        <button
          disabled={pending}
          className="rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Scanning…" : "Scan & autofill"}
        </button>
      </div>
      {state?.error && <p className="mt-2 text-sm text-guava">{state.error}</p>}
      {state?.ok && (
        <p className="mt-2 text-sm text-mango">
          Added {state.added} item{state.added === 1 ? "" : "s"} — review &amp; tidy them below.
        </p>
      )}
    </form>
  );
}
