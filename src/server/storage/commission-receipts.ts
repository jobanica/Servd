import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

export const COMMISSION_RECEIPT_BUCKET = "commission-receipts";
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * A neighborhood partner's commission payment receipt, in a PRIVATE bucket
 * namespaced by partner agreement. Returns the PATH; it is only ever shown
 * through a short-lived signed URL.
 */
export async function uploadCommissionReceipt(partnerId: string, dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|heic|heif));base64,(.+)$/);
  if (!m) throw new Error("That receipt couldn't be read. Please choose the image again.");
  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) throw new Error("Receipt too large. Please choose a smaller image.");
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, COMMISSION_RECEIPT_BUCKET, false);
  const path = `${partnerId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(COMMISSION_RECEIPT_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/** Signed URLs (10 minutes) for receipt paths, keyed by path. */
export async function signCommissionReceipts(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.storage.from(COMMISSION_RECEIPT_BUCKET).createSignedUrls(unique, 60 * 10);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  } catch {
    /* a receipt that won't sign shows as unavailable; the amounts still show */
  }
  return out;
}
