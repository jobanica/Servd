"use client";

import { useState } from "react";
import { partnerConfirm, partnerDispute } from "@/server/neighborhood/partner-actions";

/** Confirm a completed order, or flag it as cancelled / not completed for Servd to review. */
export function LineActions({ entryId, state }: { entryId: string; state: string }) {
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Couldn't save.");
    else setFlagging(false);
  }

  if (flagging) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. customer cancelled at the door"
          className="w-48 rounded-md border border-plum-ink/15 px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={busy || !note.trim()}
          onClick={() => run(() => partnerDispute(entryId, note))}
          className="rounded-md bg-guava px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
        <button type="button" onClick={() => setFlagging(false)} className="text-xs text-plum-ink/50">
          Cancel
        </button>
        {error && <span className="text-xs text-guava">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "pending" && (
        <button type="button" disabled={busy} onClick={() => run(() => partnerConfirm(entryId))} className="text-xs font-semibold text-green-700">
          Confirm
        </button>
      )}
      <button type="button" onClick={() => setFlagging(true)} className="text-xs font-semibold text-guava">
        Not completed?
      </button>
      {error && <span className="text-xs text-guava">{error}</span>}
    </div>
  );
}
