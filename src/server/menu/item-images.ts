"use server";

import { revalidatePath } from "next/cache";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { uploadMenuImageBytes } from "@/server/storage/menu-images";

/**
 * AI food-photo generation for menu items.
 *
 * Claude can't generate images, so this calls OpenAI's image API (DALL·E 3),
 * uploads the result to the public menu bucket, and sets it as the item's
 * photo. Gated on OPENAI_API_KEY; best-effort and one item per call so it stays
 * well within the serverless time limit and the owner can watch progress.
 */

export type GenImageResult = { ok: true; imageUrl: string } | { ok: false; error: string };

export async function generateItemImage(itemId: string): Promise<GenImageResult> {
  const { restaurantId } = await requireAdminAction();

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, error: "Image generation isn't configured on this server." };
  }

  const item = await tenantDb(restaurantId, (tx) =>
    tx.menuItem.findFirst({
      where: { id: itemId },
      select: { id: true, name: true, description: true },
    }),
  );
  if (!item) return { ok: false, error: "Item not found." };

  const prompt =
    `Professional food photography of "${item.name}"` +
    (item.description ? `, ${item.description}` : "") +
    `. A single serving, plated attractively and centered on a clean neutral background, ` +
    `soft natural studio lighting, fresh and appetizing, high detail. No text, no watermark, no hands.`;

  let b64: string | undefined;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return { ok: false, error: `Image API ${res.status}: ${detail}` };
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    b64 = json.data?.[0]?.b64_json;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Image generation failed." };
  }
  if (!b64) return { ok: false, error: "No image was returned." };

  let imageUrl: string;
  try {
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    imageUrl = await uploadMenuImageBytes(restaurantId, bytes, "png", "image/png");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save the image." };
  }

  await tenantDb(restaurantId, (tx) =>
    tx.menuItem.update({ where: { id: itemId }, data: { imageUrl } }),
  );
  revalidatePath("/admin/menu");
  return { ok: true, imageUrl };
}
