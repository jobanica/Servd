"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  startBuildMenuScan,
  scanBuildMenu,
  importBuildMenu,
} from "@/server/build/menu-import";
import type { BuildState } from "@/server/build/queries";

const MAX_FILES = 6;
const MAX_PDF_MB = 32;

interface DraftItem {
  name: string;
  price: string; // kept as a string so the owner can clear and retype freely
  category: string;
}

/**
 * "Upload your menu and we'll fill it in."
 *
 * The parse is a DRAFT, never a commit: whatever the model reads lands in an
 * editable list the owner corrects — fix a misread price, drop a line that
 * isn't a dish, rename a category — and only the reviewed list is saved. The
 * server re-validates it, so an edit here isn't trusted either.
 *
 * Manual quick-add stays the primary path; this is the shortcut for owners who
 * already have a printed menu in their hand.
 */
export function MenuScanPanel({
  onImported,
  disabled,
}: {
  onImported: (state: BuildState, added: number) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "scanning" | "review">("idle");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDraft([]);
    setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Shrink photos in the browser — a phone camera shot is needlessly huge. */
  async function downscale(file: File): Promise<File> {
    if (file.type === "application/pdf") return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      if (scale === 1) return file;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.82),
      );
      return blob ? new File([blob], file.name, { type: "image/jpeg" }) : file;
    } catch {
      return file; // if the browser can't, send the original
    }
  }

  async function scan() {
    const picked = fileRef.current?.files;
    if (!picked || picked.length === 0) {
      setError("Choose a photo of your menu first.");
      return;
    }
    if (picked.length > MAX_FILES) {
      setError(`Please choose at most ${MAX_FILES} files.`);
      return;
    }
    for (const f of Array.from(picked)) {
      if (f.type === "application/pdf" && f.size > MAX_PDF_MB * 1024 * 1024) {
        setError(`Each PDF must be ${MAX_PDF_MB} MB or smaller.`);
        return;
      }
    }

    setError(null);
    setPhase("scanning");
    try {
      const files = await Promise.all(Array.from(picked).map(downscale));

      // Straight to storage with a short-lived signed URL — a multi-page PDF
      // would never fit through a server action's request body.
      const prep = await startBuildMenuScan(files.map((f) => f.type));
      if (!prep.ok) {
        setError(prep.error);
        setPhase("idle");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      await Promise.all(
        files.map(async (file, i) => {
          const t = prep.targets[i];
          const { error: upErr } = await supabase.storage
            .from(prep.bucket)
            .uploadToSignedUrl(t.path, t.token, file);
          if (upErr) throw upErr;
        }),
      );

      const res = await scanBuildMenu({ paths: prep.targets.map((t) => t.path) });
      if (!res.ok) {
        setError(res.error);
        setPhase("idle");
        return;
      }
      setDraft(
        res.categories.flatMap((c) =>
          c.items.map((i) => ({ name: i.name, price: String(i.price), category: c.name })),
        ),
      );
      setPhase("review");
    } catch (e) {
      const detail = e instanceof Error && e.message ? `: ${e.message}` : "";
      setError(`Upload failed${detail}. Please try again.`);
      setPhase("idle");
    }
  }

  async function save() {
    const rows = draft.filter((r) => r.name.trim());
    if (rows.length === 0) {
      setError("Nothing left to add.");
      return;
    }
    setError(null);
    setSaving(true);

    // Regroup the flat edited list back into categories.
    const byCategory = new Map<string, DraftItem[]>();
    for (const r of rows) {
      const key = r.category.trim() || "Menu";
      const list = byCategory.get(key) ?? [];
      list.push(r);
      byCategory.set(key, list);
    }
    const payload = {
      categories: [...byCategory.entries()].map(([name, items]) => ({
        name,
        items: items.map((i) => ({
          name: i.name.trim(),
          description: "",
          price: Number(i.price) || 0,
        })),
      })),
    };

    const res = await importBuildMenu(payload);
    setSaving(false);
    if (res.ok) {
      onImported(res.state, res.added);
      reset();
    } else {
      setError(res.error);
    }
  }

  if (phase === "review") {
    return (
      <div className="mt-4 rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-3">
        <p className="text-sm font-semibold text-plum-ink">
          We read {draft.length} item{draft.length === 1 ? "" : "s"} — check them
        </p>
        <p className="text-xs text-plum-ink/55">
          Fix anything that came out wrong, or remove lines that aren&apos;t dishes. Nothing is
          saved until you tap Add.
        </p>

        <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
          {draft.map((row, i) => (
            <li key={i} className="flex gap-1.5">
              <input
                value={row.name}
                onChange={(e) =>
                  setDraft((d) => d.map((r, j) => (i === j ? { ...r, name: e.target.value } : r)))
                }
                className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
              />
              <input
                value={row.category}
                onChange={(e) =>
                  setDraft((d) =>
                    d.map((r, j) => (i === j ? { ...r, category: e.target.value } : r)),
                  )
                }
                className="w-24 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs"
              />
              <input
                value={row.price}
                onChange={(e) =>
                  setDraft((d) => d.map((r, j) => (i === j ? { ...r, price: e.target.value } : r)))
                }
                inputMode="decimal"
                className="w-16 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm tabular-nums"
              />
              <button
                onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                aria-label={`Remove ${row.name}`}
                className="px-1 text-lg leading-none text-plum-ink/35 hover:text-guava"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="mt-2 text-xs text-guava">{error}</p>}

        <div className="mt-3 flex gap-2">
          <button
            onClick={reset}
            className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 rounded-full py-2 text-sm font-bold btn-brand disabled:opacity-60"
          >
            {saving ? "Adding…" : `Add ${draft.length} items`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-plum-ink/20 p-3">
      <p className="text-sm font-semibold text-plum-ink">
        📸 Have a printed menu? We&apos;ll type it for you
      </p>
      <p className="text-xs text-plum-ink/50">
        Upload a photo or PDF — you get to check and fix everything before it&apos;s added.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,application/pdf"
          disabled={disabled || phase === "scanning"}
          className="min-w-0 flex-1 text-xs"
        />
        <button
          onClick={scan}
          disabled={disabled || phase === "scanning"}
          className="rounded-full border border-brand-primary/40 bg-white px-4 py-2 text-sm font-bold text-brand-primary disabled:opacity-50"
        >
          {phase === "scanning" ? "Reading…" : "Scan my menu"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-guava">{error}</p>}
    </div>
  );
}
