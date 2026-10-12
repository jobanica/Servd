"use client";

import { useRef, useState } from "react";
import { renameCategory, deleteCategory, setCategoryImage } from "@/server/menu/actions";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

/**
 * Category card header: shows the name with an inline "Edit" (rename) toggle
 * and the "Delete category" action. Rename calls the existing renameCategory
 * server action, which revalidates the page so the new name shows immediately.
 */
export function CategoryHeader({
  id,
  name,
  imageUrl = null,
}: {
  id: string;
  name: string;
  /** The category's own photo (not the dish photo standing in for it). */
  imageUrl?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  function cancel() {
    setEditing(false);
    setValue(name);
  }

  async function save() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      cancel();
      return;
    }
    setSaving(true);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("name", trimmed);
    await renameCategory(fd);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-1 items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-1 font-heading text-lg font-bold"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
        <button type="button" onClick={cancel} className="text-xs text-muted hover:text-plum-ink">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-2">
        <CategoryPhoto id={id} name={name} imageUrl={imageUrl} />
        <h2 className="font-heading text-lg font-bold">{name}</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted hover:text-brand-primary"
        >
          Edit
        </button>
      </div>
      <form action={deleteCategory}>
        <input type="hidden" name="id" value={id} />
        <ConfirmSubmitButton
          confirmText={`Delete the "${name}" category and ALL its items? This can't be undone.`}
          className="text-xs text-muted hover:text-guava"
        >
          Delete category
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

/**
 * The category's photo on the menu's category tabs. Tap to upload or change;
 * without one, the first dish photo in the category is shown to customers.
 */
function CategoryPhoto({ id, name, imageUrl }: { id: string; name: string; imageUrl: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(fd: FormData) {
    setBusy(true);
    setError(null);
    fd.set("id", id);
    const r = await setCategoryImage(fd);
    if (r?.error) setError(r.error);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        title={imageUrl ? `Change the photo for ${name}` : `Add a photo for ${name}`}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-plum-ink/25 bg-cream text-base disabled:opacity-50"
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
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const fd = new FormData();
          fd.set("image", file);
          void send(fd);
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
          Remove photo
        </button>
      )}
      {error && <span className="text-[11px] text-guava">{error}</span>}
    </div>
  );
}
