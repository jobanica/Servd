"use client";

import { useEffect, useState } from "react";

/**
 * Branded welcome splash shown right after the QR scan, before the menu.
 * Auto-dismisses after a moment (or on tap) and fades out. Uses the
 * restaurant's brand colors (applied by the diner layout) + logo.
 */
export function BrandSplash({
  name,
  logoUrl,
  tagline,
  onDone,
}: {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  onDone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  function dismiss() {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onDone, 500); // let the fade-out finish
  }

  useEffect(() => {
    const t = setTimeout(dismiss, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={dismiss}
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-brand-gradient px-8 text-center text-white transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className={`flex flex-col items-center ${leaving ? "" : "animate-[fadeUp_0.6s_ease-out]"}`}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={name}
            className="h-24 w-24 rounded-3xl bg-white/15 object-cover shadow-xl"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/20 font-heading text-4xl font-extrabold shadow-xl">
            {name.charAt(0)}
          </div>
        )}
        <h1 className="mt-5 font-heading text-3xl font-extrabold tracking-tight">{name}</h1>
        {tagline && <p className="mt-2 max-w-xs text-sm text-white/85">{tagline}</p>}
      </div>
      <p className="absolute bottom-10 text-xs text-white/70">Tap to continue</p>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
