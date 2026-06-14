"use client";

import { useState } from "react";
import { submitFeedback, recordGoogleClick } from "@/server/feedback/actions";

export function FeedbackForm({
  slug,
  tableToken,
  googleReviewUrl,
}: {
  slug: string;
  tableToken: string;
  googleReviewUrl: string | null;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);

  async function handleSubmit() {
    if (rating < 1) {
      setError("Please tap a star to rate.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await submitFeedback({ slug, tableToken, rating, comment });
    setBusy(false);
    if (res.ok) {
      setFeedbackId(res.feedbackId ?? null);
      setDone(true);
    } else {
      setError(res.error ?? "Couldn't submit feedback.");
    }
  }

  async function handleGoogle() {
    if (feedbackId) await recordGoogleClick(feedbackId);
    if (googleReviewUrl) window.open(googleReviewUrl, "_blank", "noopener");
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
          ✓
        </div>
        <h2 className="mt-4 font-heading text-xl font-bold text-brand-ink">
          Thanks for your feedback!
        </h2>

        {/* Google invite — offered to EVERY diner, regardless of rating. */}
        {googleReviewUrl && (
          <div className="mt-6">
            <p className="text-sm text-brand-ink/70">
              Would you share your experience on Google? It really helps us.
            </p>
            <button
              onClick={handleGoogle}
              className="mt-3 w-full rounded-full py-3 font-semibold btn-brand"
            >
              Leave a Google review
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-heading text-xl font-bold text-brand-ink">
        How was your visit?
      </h2>
      <p className="mt-1 text-sm text-brand-ink/60">
        Your rating goes straight to the restaurant.
      </p>

      <div className="mt-5 flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="text-4xl"
            style={{ color: (hover || rating) >= n ? "var(--brand-primary)" : "#d8cdc6" }}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder="Anything you'd like to tell us? (optional)"
        className="mt-5 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
      />

      {error && <p className="mt-3 text-sm text-guava">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={busy}
        className="mt-4 w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-60"
      >
        {busy ? "Submitting…" : "Submit feedback"}
      </button>
    </div>
  );
}
