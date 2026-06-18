"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireAdminAction } from "@/server/tenancy/require-admin";
import { pesosToCentavos } from "@/lib/money";
import { ALLOWED_MENU_DOC_TYPES } from "@/lib/validation/menu";
import {
  createImportUploadTargets,
  signImportReadUrls,
  removeImports,
  MENU_IMPORT_BUCKET,
  type UploadTarget,
} from "@/server/storage/menu-imports";

/**
 * AI menu import — snap a photo of a printed menu and let Claude turn it into
 * structured categories + items the owner can review and import in one tap.
 *
 * Steps so the owner stays in control:
 *   0. createMenuImportUploads — signed URLs; the browser uploads to storage.
 *   1. analyzeMenuMedia — vision model reads the file(s) → structured draft.
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

export type CreateUploadsResult =
  | { ok: true; bucket: string; targets: UploadTarget[] }
  | { ok: false; error: string };

/**
 * Step 0 — hand the browser short-lived signed upload URLs so it can send the
 * files straight to Supabase Storage, bypassing the serverless body limit.
 */
export async function createMenuImportUploads(types: string[]): Promise<CreateUploadsResult> {
  const { restaurantId } = await requireAdminAction();

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI menu import isn't configured on this server." };
  }
  if (!Array.isArray(types) || types.length === 0) {
    return { ok: false, error: "Add at least one menu photo or PDF." };
  }
  if (types.length > MAX_FILES) {
    return { ok: false, error: `Please upload at most ${MAX_FILES} files at a time.` };
  }
  for (const t of types) {
    if (!(ALLOWED_MENU_DOC_TYPES as readonly string[]).includes(t)) {
      return { ok: false, error: "Files must be a JPG, PNG, WebP photo or a PDF." };
    }
  }

  try {
    const targets = await createImportUploadTargets(restaurantId, types);
    return { ok: true, bucket: MENU_IMPORT_BUCKET, targets };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Couldn't prepare the upload: ${e.message}` : "Couldn't prepare the upload.",
    };
  }
}

/** Step 1 — read the uploaded photo(s)/PDF from storage into a menu draft. */
export async function analyzeMenuMedia(input: {
  paths: string[];
  generateDescriptions: boolean;
}): Promise<AnalyzeResult> {
  const { restaurantId } = await requireAdminAction();

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI menu import isn't configured on this server." };
  }

  const paths = Array.isArray(input?.paths)
    ? input.paths.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  if (paths.length === 0) return { ok: false, error: "Add at least one menu photo or PDF." };
  if (paths.length > MAX_FILES) {
    return { ok: false, error: `Please upload at most ${MAX_FILES} files at a time.` };
  }
  // Tenant isolation — only read this restaurant's own uploads.
  for (const p of paths) {
    if (!p.startsWith(`${restaurantId}/`)) {
      return { ok: false, error: "That upload couldn't be verified. Please try again." };
    }
  }

  let text: string;
  try {
    // Signed read URLs Anthropic fetches directly — a PDF is a document block,
    // photos are image blocks.
    const urls = await signImportReadUrls(paths);
    const blocks: Anthropic.ContentBlockParam[] = urls.map((url, i) =>
      paths[i].toLowerCase().endsWith(".pdf")
        ? { type: "document", source: { type: "url", url } }
        : { type: "image", source: { type: "url", url } },
    );

    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      system: buildSystemPrompt(input.generateDescriptions),
      messages: [
        {
          role: "user",
          content: [
            ...blocks,
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
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `Couldn't read the menu: ${e.message}` : "Couldn't read the menu.",
    };
  } finally {
    await removeImports(paths); // temp uploads aren't needed once analyzed
  }

  return parseMenuText(text);
}

/** Tolerantly parse the model's JSON into a clean, validated draft. */
function parseMenuText(text: string): AnalyzeResult {
  // The model may wrap the object in prose or a code fence.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "Couldn't find any menu items. Try a clearer photo." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: "Couldn't read the menu. Please try a clearer picture." };
  }

  const parsed = parsedMenuSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Couldn't find any menu items in that file." };
  }

  // Drop empty categories and round prices for a clean draft.
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
    return { ok: false, error: "Couldn't find any menu items in that file." };
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

export type CreatedItem = { id: string; name: string };
export type ImportResult =
  | { ok: true; categories: number; items: number; created: CreatedItem[] }
  | { ok: false; error: string };

/** Step 2 — write the reviewed draft into the menu (idempotent-ish). */
export async function importParsedMenu(input: unknown): Promise<ImportResult> {
  const { restaurantId } = await requireAdminAction();

  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid menu data." };
  }

  let createdCategories = 0;
  const created: CreatedItem[] = [];

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
          const createdCat = await tx.category.create({
            data: { restaurantId, name: cat.name.trim(), sortOrder: sortOrder++ },
            select: { id: true },
          });
          categoryId = createdCat.id;
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
          const name = item.name.trim();
          const row = await tx.menuItem.create({
            data: {
              restaurantId,
              categoryId,
              name,
              description: item.description?.trim() || null,
              price: pesosToCentavos(item.price),
              isAvailable: true,
            },
            select: { id: true },
          });
          created.push({ id: row.id, name });
        }
      }
    });
  } catch {
    return { ok: false, error: "Couldn't save the menu. Please try again." };
  }

  revalidatePath("/admin/menu");
  return { ok: true, categories: createdCategories, items: created.length, created };
}
