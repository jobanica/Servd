"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createPartnerDemo,
  scanPartnerDemoMenu,
  deletePartnerDemo,
  type DemoFormState,
  type DemoScanState,
} from "@/server/partners/demo";
import type { PartnerDemoRow } from "@/server/partners/demo-queries";

export function PartnerDemos({ demos, appUrl }: { demos: PartnerDemoRow[]; appUrl: string }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(demos.length === 0);
  const [state, action] = useActionState<DemoFormState, FormData>(createPartnerDemo, null);

  // Clear + refresh once a demo is created.
  useEffect(() => {
    if (state?.ok) {
      setShowAdd(false);
      router.refresh();
    }
  }, [state?.ok, router]);

  const field = "w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Demo storefronts</p>
          <p className="text-xs text-plum-ink/50">
            Build a live ordering page for a prospect to show them Servd in action.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
        >
          {showAdd ? "Close" : "+ New demo"}
        </button>
      </div>

      {showAdd && (
        <form key={state?.ok ? "ok" : "form"} action={action} className="mt-4 grid gap-2 rounded-lg border border-plum-ink/10 bg-cream/40 p-3 sm:grid-cols-2">
          <input name="name" required placeholder="Restaurant name *" className={`${field} sm:col-span-2`} />
          <input name="tagline" placeholder="Tagline (optional)" className={field} />
          <input name="logoUrl" placeholder="Logo URL (optional)" className={field} />
          <input name="address" placeholder="Address (optional)" className={field} />
          <input name="phone" placeholder="Phone (optional)" className={field} />
          <div className="flex items-center gap-3 sm:col-span-2">
            <button className="rounded-full px-4 py-2 text-sm font-semibold btn-brand text-white">
              Create demo
            </button>
            {state?.error && <span className="text-sm text-guava">{state.error}</span>}
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {demos.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No demos yet. Create one to pitch a prospect.</p>
        ) : (
          demos.map((d) => <DemoRow key={d.id} demo={d} appUrl={appUrl} />)
        )}
      </div>
    </div>
  );
}

function DemoRow({ demo, appUrl }: { demo: PartnerDemoRow; appUrl: string }) {
  const router = useRouter();
  const url = `${appUrl.replace(/\/$/, "")}/r/${demo.slug}`;
  const [copied, setCopied] = useState(false);
  const [scanState, scanAction] = useActionState<DemoScanState, FormData>(scanPartnerDemoMenu, null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scanState?.ok) router.refresh();
  }, [scanState?.ok, router]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-lg border border-plum-ink/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{demo.name}</p>
          <p className="text-xs text-plum-ink/45">
            {demo.itemCount} item{demo.itemCount === 1 ? "" : "s"} ·{" "}
            <span className="break-all">{url}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/partner/demo/${demo.id}`}
            className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white"
          >
            Manage / menu →
          </Link>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
          >
            Open ↗
          </a>
          <button
            onClick={copy}
            className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <form action={deletePartnerDemo}>
            <input type="hidden" name="id" value={demo.id} />
            <button className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-guava hover:bg-guava/10">
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* AI menu scan — fills the storefront from a photo/PDF of the menu. */}
      <form action={scanAction} className="mt-3 flex flex-wrap items-center gap-2 border-t border-plum-ink/5 pt-3">
        <input type="hidden" name="restaurantId" value={demo.id} />
        <input
          ref={fileRef}
          name="images"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="text-xs"
        />
        <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream">
          Scan menu photo →
        </button>
        {scanState?.ok && <span className="text-xs text-mango">Added {scanState.added} items ✓</span>}
        {scanState?.error && <span className="text-xs text-guava">{scanState.error}</span>}
      </form>
    </div>
  );
}
