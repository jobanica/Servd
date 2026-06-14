"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatPeso, formatDelta } from "@/lib/money";
import {
  unitPrice,
  validateSelection,
  selectionToLineModifiers,
} from "@/lib/cart/pricing";
import type { CartLine, DinerItem, Selection } from "@/lib/cart/types";
import { VideoPlayer } from "./VideoPlayer";

/** Generates a unique line id without pulling in a uuid dependency. */
function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ItemModal({
  item,
  onAdd,
  onClose,
}: {
  item: DinerItem;
  onAdd: (line: CartLine) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showError, setShowError] = useState(false);
  const t = useTranslations("item");

  const price = useMemo(() => unitPrice(item, selection), [item, selection]);
  const error = useMemo(
    () => validateSelection(item, selection),
    [item, selection],
  );

  function toggle(groupId: string, modId: string, single: boolean, max: number) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [modId] };
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((m) => m !== modId) };
      }
      if (current.length >= max) return prev; // at max — ignore
      return { ...prev, [groupId]: [...current, modId] };
    });
  }

  function handleAdd() {
    if (error) {
      setShowError(true);
      return;
    }
    onAdd({
      lineId: lineId(),
      itemId: item.id,
      name: item.name,
      basePrice: item.price,
      unitPrice: price,
      quantity,
      modifiers: selectionToLineModifiers(item, selection),
      note: note.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 sm:rounded-tile">
        <div className="flex items-start justify-between">
          <h2 className="font-heading text-xl font-bold text-brand-ink">
            {item.name}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-plum-ink/40"
          >
            ×
          </button>
        </div>
        {item.description && (
          <p className="mt-1 text-sm text-brand-ink/60">{item.description}</p>
        )}

        {item.videoUrl && (
          <div className="mt-3">
            <VideoPlayer url={item.videoUrl} poster={item.videoPosterUrl ?? item.imageUrl} />
          </div>
        )}

        {item.groups.map((group) => {
          const single = group.maxSelect === 1;
          const chosen = selection[group.id] ?? [];
          return (
            <fieldset key={group.id} className="mt-5">
              <legend className="font-semibold text-brand-ink">
                {group.name}{" "}
                <span className="text-xs font-normal text-plum-ink/50">
                  ({group.required ? t("required") : t("optional")})
                  {!single && ` · ${t("upTo", { n: group.maxSelect })}`}
                </span>
              </legend>
              <div className="mt-2 space-y-1">
                {group.modifiers.map((mod) => {
                  const isChosen = chosen.includes(mod.id);
                  return (
                    <label
                      key={mod.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type={single ? "radio" : "checkbox"}
                          name={group.id}
                          checked={isChosen}
                          onChange={() =>
                            toggle(group.id, mod.id, single, group.maxSelect)
                          }
                        />
                        {mod.name}
                      </span>
                      {mod.priceDelta !== 0 && (
                        <span className="text-sm text-brand-primary">
                          {formatDelta(mod.priceDelta)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-brand-ink">
            {t("specialRequest")}
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("specialRequestPlaceholder")}
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
          />
        </label>

        {showError && error && (
          <p className="mt-3 text-sm text-guava">{error}</p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-plum-ink/15">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-2 text-lg"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="px-3 py-2 text-lg"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={!!error}
            className="flex-1 rounded-full py-3 font-semibold btn-brand disabled:opacity-50"
          >
            {t("add")} · {formatPeso(price * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
