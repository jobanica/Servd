/**
 * Turning a campaign body into one person's email. Pure and framework-free so
 * the merge-tag and escaping rules are testable — they're the part that would
 * quietly send `{{name}}` to two hundred people if it broke.
 */

export interface MergeFields {
  name: string;
  email: string;
}

/** Fills `{{name}}` / `{{email}}`. Unknown tags are left alone, not blanked —
 *  a visible `{{oops}}` in a preview is better than silent data loss. */
export function applyMergeTags(body: string, fields: MergeFields): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => {
    if (key === "name") return fields.name;
    if (key === "email") return fields.email;
    return whole;
  });
}

/** Minimal HTML escaping — campaign bodies are plain text authored by us. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RenderedEmail {
  text: string;
  html: string;
}

/**
 * Renders the plain-text and HTML bodies for one recipient, both carrying the
 * unsubscribe link. It is appended here rather than left to the author so an
 * email can't go out without one — that's a legal requirement, not a nicety.
 */
export function renderEmail(
  body: string,
  fields: MergeFields,
  unsubscribeUrl: string,
): RenderedEmail {
  const merged = applyMergeTags(body, fields);

  const text = `${merged}\n\n—\nDon't want these emails? Unsubscribe: ${unsubscribeUrl}`;

  const paragraphs = merged
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#2b2130;max-width:560px;margin:0 auto;padding:24px">
${paragraphs}
<hr style="border:none;border-top:1px solid #e8e2ea;margin:28px 0 12px">
<p style="margin:0;font-size:12px;color:#8d8394">
Don't want these emails? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8d8394">Unsubscribe</a>.
</p>
</div>`;

  return { text, html };
}
