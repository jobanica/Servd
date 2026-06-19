"use client";

import { useActionState, useEffect, useState } from "react";
import { submitPlatformFeedback, type FeedbackState } from "@/server/platform-feedback/actions";

/**
 * Lets a restaurant owner send feedback / a recommendation about Servd itself
 * (goes to the platform super-admin). Lives in the admin sidebar.
 */
export function PlatformFeedbackButton() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [state, action, pending] = useActionState<FeedbackState, FormData>(submitPlatformFeedback, null);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => {
        setOpen(false);
        setRating(0);
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-plum-ink/60 hover:bg-plum-ink/5"
      >
        💬 Send feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold">Send feedback</h2>
              <button onClick={() => setOpen(false)} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
            </div>
            <p className="mb-3 text-sm text-plum-ink/55">
              Tell us what you love, what&apos;s missing, or what we could improve. This goes
              straight to the Servd team.
            </p>

            {state?.ok ? (
              <p className="rounded-lg bg-mango/10 px-3 py-6 text-center text-sm font-semibold text-mango">
                🙏 Thanks for the feedback!
              </p>
            ) : (
              <form action={action} className="space-y-3">
                {/* Optional star rating */}
                <input type="hidden" name="rating" value={rating} />
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      key={n}
                      onClick={() => setRating(n)}
                      className={`text-2xl leading-none ${n <= rating ? "text-mango" : "text-plum-ink/20"}`}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-plum-ink/40">{rating ? `${rating}/5` : "Optional rating"}</span>
                </div>

                <textarea
                  name="message"
                  rows={5}
                  required
                  placeholder="Your feedback or recommendation…"
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />

                {state?.error && <p className="text-sm text-guava">{state.error}</p>}
                <button
                  disabled={pending}
                  className="w-full rounded-full py-2.5 text-sm font-semibold btn-brand disabled:opacity-60"
                >
                  {pending ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
