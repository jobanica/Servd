import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient, ensureBucket } from "@/lib/supabase/admin";

export const RIDER_RECEIPT_BUCKET = "rider-receipts";
const MAX_BYTES = 4 * 1024 * 1024; // ~4 MB after compression on the phone

/**
 * Uploads the photo a rider takes of a customer's GCash receipt to a PRIVATE
 * bucket, namespaced by restaurant. Returns the storage PATH; it is only ever
 * shown through a short-lived signed URL, since a receipt carries the
 * customer's name and number.
 */
export async function uploadRiderReceipt(restaurantId: string, dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|heic|heif));base64,(.+)$/);
  if (!m) throw new Error("That photo couldn't be read. Please take it again.");
  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_BYTES) throw new Error("Photo too large. Please take it again.");
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");

  const supabase = createSupabaseAdminClient();
  await ensureBucket(supabase, RIDER_RECEIPT_BUCKET, false);
  const path = `${restaurantId}/${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(RIDER_RECEIPT_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

/**
 * Signed URLs (10 minutes) for receipt paths, keyed by path. Only paths under
 * this restaurant's folder are signed, so a path can never reach another
 * restaurant's receipts.
 */
export async function signRiderReceipts(
  restaurantId: string,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const mine = [...new Set(paths.filter((p): p is string => !!p && p.startsWith(`${restaurantId}/`)))];
  const out = new Map<string, string>();
  if (mine.length === 0) return out;
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.storage.from(RIDER_RECEIPT_BUCKET).createSignedUrls(mine, 60 * 10);
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  } catch {
    /* receipts are a nicety on this screen; the totals still show */
  }
  return out;
}
