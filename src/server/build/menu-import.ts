"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import {
  MAX_IMPORT_FILES,
  allowedImportTypes,
  analyzeMenuFor,
  reviewedMenuSchema,
  writeReviewedMenu,
  type AnalyzeResult,
} from "@/server/menu/menu-scan";
import {
  createImportUploadTargets,
  MENU_IMPORT_BUCKET,
  type UploadTarget,
} from "@/server/storage/menu-imports";
import { currentBuild } from "./session";
import { getBuildState, type BuildState } from "./queries";
import { rateLimit } from "./rate-limit";

/**
 * "Upload your printed menu and we'll fill it in" for the public DIY builder.
 *
 * Same three steps as the admin flow, and the same prompt and parser (see
 * menu-scan.ts) — what differs is authorization: there is no session here, so
 * every call resolves the restaurant through the build-token cookie and refuses
 * anything that isn't still a preview. It is also rate-limited, because this is
 * an unauthenticated endpoint that costs real model tokens.
 *
 * The parse is NEVER written straight to the menu. Step 1 returns a draft to
 * the browser for the owner to correct, and step 2 re-validates whatever comes
 * back — the client's edits are no more trusted than the model's output.
 */

export type BuildUploadsResult =
  | { ok: true; bucket: string; targets: UploadTarget[] }
  | { ok: false; error: string };

/** Step 0 — signed URLs so the browser uploads straight to storage. */
export async function startBuildMenuScan(types: string[]): Promise<BuildUploadsResult> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "Start with your restaurant name first." };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Menu scanning isn't available right now — please add your items by hand." };
  }
  if (!allowedImportTypes(types)) {
    return {
      ok: false,
      error: `Add 1–${MAX_IMPORT_FILES} menu files — JPG, PNG, WebP photos or a PDF.`,
    };
  }

  const limited = await rateLimit("build:scan");
  if (!limited.ok) return { ok: false, error: limited.error! };

  try {
    const targets = await createImportUploadTargets(ctx.restaurantId, types);
    return { ok: true, bucket: MENU_IMPORT_BUCKET, targets };
  } catch {
    return { ok: false, error: "Couldn't prepare the upload. Please try again." };
  }
}

/** Step 1 — read the uploaded file(s) into an editable draft. Writes nothing. */
export async function scanBuildMenu(input: { paths: string[] }): Promise<AnalyzeResult> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "Start with your restaurant name first." };

  const paths = Array.isArray(input?.paths)
    ? input.paths.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  // Descriptions are always copied, never invented: the owner is about to show
  // this preview to real customers, so we don't put words in their mouth.
  return analyzeMenuFor(ctx.restaurantId, paths, false);
}

export type BuildImportResult =
  | { ok: true; state: BuildState; added: number }
  | { ok: false; error: string };

/** Step 2 — write the draft the owner just reviewed and corrected. */
export async function importBuildMenu(input: unknown): Promise<BuildImportResult> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "This build link is no longer valid." };

  const parsed = reviewedMenuSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the items." };
  }

  const limited = await rateLimit("build:write");
  if (!limited.ok) return { ok: false, error: limited.error! };

  // A preview is a taster, not the full menu — cap what one import can add.
  const existing = await systemDb((tx) => tx.menuItem.count({ where: { restaurantId: ctx.restaurantId } }));
  const incoming = parsed.data.categories.reduce((n, c) => n + c.items.length, 0);
  if (existing + incoming > 120) {
    return { ok: false, error: "That's a big menu — trim it for the preview, then add the rest once you're live." };
  }

  let added: number;
  try {
    const { created } = await writeReviewedMenu(ctx.restaurantId, parsed.data, (fn) => systemDb(fn));
    added = created.length;
  } catch {
    return { ok: false, error: "Couldn't save those items. Please try again." };
  }

  const state = await getBuildState(ctx.token);
  if (!state) return { ok: false, error: "This build link is no longer valid." };
  return { ok: true, state, added };
}
