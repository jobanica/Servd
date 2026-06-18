"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { pesosToCentavos } from "@/lib/money";
import {
  ALLOWED_MENU_DOC_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
} from "@/lib/validation/menu";

/**
 * AI menu import — snap a photo of a printed menu and let Claude turn it into
 * structured categories + items the owner can review and import in one tap.
 *
 * Two steps so the owner stays in control:
 *   1. analyzeMenuPhoto — vision model reads the photo(s) → structured draft.
 *   2. importParsedMenu — writes the (possibly edited) draft to the menu.
 *
 * Best-effort + safe: if ANTHROPIC_API_KEY is unset or the model misbehaves we
 * return a friendly error rather than throwing, and nothing is written until
 * the owner confirms in the review step.
 */

export interface ParsedItem {
  name: string;
  description: string;
  price: number; // pesos
}
export interface ParsedCategory {
  name: string;
  items: ParsedItem[];
}

export type AnalyzeResult =
  | { ok: true; categories: ParsedCategory[] }
  | { ok: false; error: string };

const MAX_FILES = 6;

/** The description rule changes depending on the owner's toggle. */
function describeRule(generate: boolean): string {
  return generate
    ? `- description: copy any printed description verbatim. For items WITHOUT a printed description, WRITE a short, appetizing one (max ~14 words) based on the item name — natural and accurate, never invent specific ingredients you can't infer from the name.`
    : `- description: copy any printed description; otherwise use an empty string. Do NOT invent descriptions.`;
}

function buildSystemPrompt(generateDescriptions: boolean): string {
  return `You are a menu-digitizing assistant for a restaurant ordering platform in the Philippines (prices are in Philippine pesos, ₱).
You are given one or more photos or a PDF of a printed or handwritten food menu.
Extract every menu item you can read into structured data.

Rules:
- Group items under their printed category/section headings exactly as written (e.g. "Appetizers", "Mains", "Drinks").
- If a section is unlabeled, or items have no clear heading, INFER a sensible category for each item from what it is (e.g. "Appetizers", "Rice Meals", "Noodles", "Drinks", "Desserts"). Prefer a few well-named categories over one generic "Menu" bucket; only use "Menu" when an item is truly ambiguous.
- price: the item's peso price as a plain number (e.g. 149 or 149.5). Strip the ₱/PHP sign and any commas. If an item lists multiple sizes/prices, pick the smallest and append the size to the name (e.g. "Iced Tea (Regular)"). If a price is unreadable, use 0.
${describeRule(generateDescriptions)}
- Preserve the exact item names. Fix only obvious OCR glitches.
- Skip non-item text (addresses, phone numbers, "open daily", slogans).
- Order categories the way a customer would expect to browse them (starters → mains → sides → drinks → desserts).
- Return ONLY a JSON object, no prose, no code fence, of the form:
  {"categories":[{"name":"...","items":[{"name":"...","description":"...","price":0}]}]}`;
}

/** Validates the model's JSON before we trust it. */
const parsedMenuSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              description: z.string().trim().max(500).optional().default(""),
              price: z.coerce.number().min(0).max(1_000_000).catch(0),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

type ImgMediaType = "image/jpeg" | "image/png" | "image/webp";
function mediaTypeFor(file: File): ImgMediaType {
  return file.type === "image/png"
    ? "image/png"
    : file.type === "image/webp"
      ? "image/webp"
      : "image/jpeg";
}

/** Step 1 — read the uploaded photo(s) or PDF into a structured menu draft. */
export async function analyzeMenuPhoto(formData: FormData): Promise<AnalyzeResult> {
  await requireAdminAction();

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI menu import isn't configured on this server." };
  }

  const generateDescriptions = formData.get("generateDescriptions") === "true";
  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) return { ok: false, error: "Add at least one menu photo or PDF." };
  if (files.length > MAX_FILES) {
    return { ok: false, error: `Please upload at most ${MAX_FILES} files at a time.` };
  }
  for (const f of files) {
    if (!(ALLOWED_MENU_DOC_TYPES as readonly string[]).includes(f.type)) {
      return { ok: false, error: "Files must be a JPG, PNG, WebP photo or a PDF." };
    }
    const isPdf = f.type === "application/pdf";
    if (isPdf && f.size > MAX_PDF_BYTES) {
      return { ok: false, error: "The PDF must be 32 MB or smaller." };
    }
    if (!isPdf && f.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: "Each photo must be 5 MB or smaller." };
    }
  }

  // Photos become image blocks; a PDF becomes a document block.
  const docBlocks: Anthropic.ContentBlockParam[] = await Promise.all(
    files.map(async (file): Promise<Anthropic.ContentBlockParam> => {
      const data = Buffer.from(await file.arrayBuffer()).toString("base64");
      if (file.type === "application/pdf") {
        return {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        };
      }
      return {
        type: "image",
        source: { type: "base64", media_type: mediaTypeFor(file), data },
      };
    }),
  );

  let text: string;
  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system: buildSystemPrompt(generateDescriptions),
      messages: [
        {
          role: "user",
          content: [
            ...docBlocks,
            { type: "text", text: "Digitize this menu into the JSON schema described." },
          ],
        },
      ],
    });
    text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch {
    return { ok: false, error: "Couldn't read the menu photo. Please try again." };
  }

  // Tolerate the model wrapping the object in prose or a code fence.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "Couldn't find any menu items in that photo." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: "Couldn't read the menu photo. Please try a clearer picture." };
  }

  const parsed = parsedMenuSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Couldn't find any menu items in that photo." };
  }

  // Drop empty categories and round prices to whole pesos for a clean draft.
  const categories = parsed.data.categories
    .map((c) => ({
      name: c.name,
      items: c.items.map((i) => ({
        name: i.name,
        description: i.description ?? "",
        price: Math.round(i.price * 100) / 100,
      })),
    }))
    .filter((c) => c.items.length > 0);

  if (categories.length === 0) {
    return { ok: false, error: "Couldn't find any menu items in that photo." };
  }
  return { ok: true, categories };
}

// Re-validate the reviewed draft on the server — the client may have edited it.
const importSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Category name is required").max(80),
        items: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              description: z.string().trim().max(500).optional().default(""),
              price: z.coerce.number().min(0).max(1_000_000),
            }),
          )
          .default([]),
      }),
    )
    .min(1, "Nothing to import"),
});

export type ImportResult = { ok: true; categories: number; items: number } | { ok: false; error: string };

/** Step 2 — write the reviewed draft into the menu (idempotent-ish). */
export async function importParsedMenu(input: unknown): Promise<ImportResult> {
  const { restaurantId } = await requireAdminAction();

  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid menu data." };
  }

  let createdCategories = 0;
  let createdItems = 0;

  try {
    await tenantDb(restaurantId, async (tx) => {
      // Existing categories, lower-cased name → id, so a re-import reuses them.
      const existing = await tx.category.findMany({ select: { id: true, name: true } });
      const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));
      let sortOrder = existing.length;

      for (const cat of parsed.data.categories) {
        const items = cat.items.filter((i) => i.name.trim().length > 0);
        if (items.length === 0) continue;

        const key = cat.name.trim().toLowerCase();
        let categoryId = byName.get(key);
        if (!categoryId) {
          const created = await tx.category.create({
            data: { restaurantId, name: cat.name.trim(), sortOrder: sortOrder++ },
            select: { id: true },
          });
          categoryId = created.id;
          byName.set(key, categoryId);
          createdCategories++;
        }

        // Skip items already present in this category (by case-insensitive name).
        const present = new Set(
          (
            await tx.menuItem.findMany({
              where: { categoryId },
              select: { name: true },
            })
          ).map((i) => i.name.trim().toLowerCase()),
        );

        for (const item of items) {
          const nameKey = item.name.trim().toLowerCase();
          if (present.has(nameKey)) continue;
          present.add(nameKey);
          await tx.menuItem.create({
            data: {
              restaurantId,
              categoryId,
              name: item.name.trim(),
              description: item.description?.trim() || null,
              price: pesosToCentavos(item.price),
              isAvailable: true,
            },
          });
          createdItems++;
        }
      }
    });
  } catch {
    return { ok: false, error: "Couldn't save the menu. Please try again." };
  }

  revalidatePath("/admin/menu");
  return { ok: true, categories: createdCategories, items: createdItems };
}
