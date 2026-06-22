"use client";

import { useActionState } from "react";
import { updateItem, type FormState } from "@/server/menu/actions";
import { DIETARY_TAGS } from "@/lib/menu/dietary";
import { SubmitButton } from "./SubmitButton";

type Category = { id: string; name: string };
type Item = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  isAvailable: boolean;
  imageUrl: string | null;
  videoUrl: string | null;
  dietaryTags?: string[];
};

export function EditItemForm({
  item,
  categories,
}: {
  item: Item;
  categories: Category[];
}) {
  const [state, action] = useActionState<FormState, FormData>(updateItem, null);

  return (
    <form
      action={action}
      className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5"
    >
      <input type="hidden" name="id" value={item.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input
            name="name"
            defaultValue={item.name}
            required
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Category</span>
          <select
            name="categoryId"
            defaultValue={item.categoryId}
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Price (₱)</span>
          <input
            name="pricePesos"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(item.price / 100).toFixed(2)}
            required
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Food cost (₱)</span>
          <input
            name="costPesos"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(item.cost / 100).toFixed(2)}
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-plum-ink/40">Used for accounting COGS &amp; margins.</span>
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            name="isAvailable"
            defaultChecked={item.isAvailable}
          />
          Available (in stock)
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium">Description</span>
        <textarea
          name="description"
          defaultValue={item.description ?? ""}
          rows={3}
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
        />
      </label>

      <fieldset className="block text-sm">
        <span className="font-medium">Dietary &amp; allergen tags</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => (
            <label
              key={tag.key}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary/10 has-[:checked]:text-brand-primary"
            >
              <input
                type="checkbox"
                name="dietaryTags"
                value={tag.key}
                defaultChecked={item.dietaryTags?.includes(tag.key)}
                className="sr-only"
              />
              <span>{tag.emoji}</span>
              {tag.label}
            </label>
          ))}
        </div>
        <span className="mt-1 block text-xs text-plum-ink/40">
          Shown to diners as badges; diners can filter the menu by the green preference tags.
        </span>
      </fieldset>

      <div className="flex items-center gap-4">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-16 w-16 rounded-lg object-cover"
          />
        )}
        <label className="text-sm">
          <span className="mr-2 text-plum-ink/60">
            {item.imageUrl ? "Replace photo" : "Add photo"}
          </span>
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            className="text-xs"
          />
        </label>
      </div>

      <div className="rounded-lg border border-plum-ink/10 p-3">
        <p className="text-sm font-medium">Video (optional)</p>
        <p className="text-xs text-plum-ink/50">
          Paste a YouTube/Vimeo or direct link, or upload an MP4/WebM (≤ 50 MB).
        </p>
        <input
          name="videoUrl"
          defaultValue={item.videoUrl ?? ""}
          placeholder="https://youtu.be/… or https://…/clip.mp4"
          className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <input
          type="file"
          name="video"
          accept="video/mp4,video/webm"
          className="mt-2 block text-xs"
        />
        {item.videoUrl && (
          <label className="mt-2 flex items-center gap-2 text-xs text-plum-ink/60">
            <input type="checkbox" name="removeVideo" /> Remove current video
          </label>
        )}
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Saved.</p>}
      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
