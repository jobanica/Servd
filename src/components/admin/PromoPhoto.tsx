"use client";

import { useRef, useState } from "react";
import { setPromotionImage } from "@/server/promotions/actions";
import { compressImageFile, HARD_MAX_BYTES, HARD_LIMIT_MESSAGE } from "@/lib/images/compress";

/** A promotion's photo on the admin list. Tap to add or change it. */
export function PromoPhoto({ id, title, imageUrl }: { id: string; title: string; imageUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(fd: FormData) {
    setBusy(true);
    setError(null);
    fd.set("id", id);
    const r = await setPromotionImage(fd);
    if (r?.error) setError(r.error);
    setBusy(false);
  }

  async function pick(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Shrink a camera photo first: an oversized request never reaches us.
      const res = await compressImageFile(file);
      if (res.bytes > HARD_MAX_BYTES) {
        setError(HARD_LIMIT_MESSAGE);
        setBusy(false);
        return;
      }
      const fd = new FormData();
      fd.set("image", res.file);
      await send(fd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that image.");
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        title={imageUrl ? `Change the photo for ${title}` : `Add a photo for ${title}`}
        className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-plum-ink/25 bg-cream text-lg disabled:opacity-50"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden>📷</span>
        )}
        {busy && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs">…</span>}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
      {imageUrl && !busy && (
        <button
          type="button"
          onClick={() => {
            const fd = new FormData();
            fd.set("remove", "1");
            void send(fd);
          }}
          className="text-[11px] text-muted hover:text-guava"
        >
          Remove
        </button>
      )}
      {error && <span className="max-w-[8rem] text-center text-[11px] text-guava">{error}</span>}
    </div>
  );
}
