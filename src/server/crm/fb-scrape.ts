import "server-only";

/**
 * Best-effort extraction of a business's public details from its Facebook page.
 *
 * Facebook has no open API for arbitrary pages and gates a lot behind login, so
 * this is heuristic scraping: it reliably gets the page NAME (Open Graph title)
 * and often the phone / address / email / website when the page lists them
 * publicly. Anything it can't find is left blank for the user to fill. Never
 * throws — returns whatever it could read.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";
const TIMEOUT_MS = 9000;
const MAX_BYTES = 1_200_000;

export interface FbInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
}

function decode(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .trim();
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decode(m[1]) : null;
}

function jsonField(html: string, ...keys: string[]): string | null {
  for (const k of keys) {
    const m = html.match(new RegExp(`"${k}"\\s*:\\s*"([^"]{2,200})"`, "i"));
    if (m && m[1].trim()) return decode(m[1]);
  }
  return null;
}

function extractName(html: string): string | null {
  const raw = meta(html, "og:title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || null;
  if (!raw) return null;
  const name = decode(raw)
    .replace(/\s*[|\-–·]\s*(Facebook|Home|About|Posts|Photos).*$/i, "")
    .trim();
  if (!name || /^(facebook|log in|page not found)$/i.test(name)) return null;
  return name;
}

function extractEmail(html: string): string | null {
  const mailto = html.match(/mailto:([^"'?>\s\\]+@[^"'?>\s\\]+)/i);
  const candidate =
    (mailto && decode(mailto[1])) ||
    html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  if (!candidate) return null;
  const email = candidate.trim().toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(email)) return null;
  if (/(facebook|fbcdn|sentry|example\.)/i.test(email)) return null;
  return email;
}

function extractPhone(html: string): string | null {
  // FB inline JSON often carries the public phone; also try tel: links.
  const fromJson = jsonField(html, "phone", "phone_number");
  const tel = html.match(/tel:([+\d][\d\s().-]{6,})/i)?.[1];
  const candidate = fromJson || (tel && decode(tel)) || null;
  if (!candidate) return null;
  const cleaned = candidate.replace(/[^\d+]/g, "");
  // 7–15 digits is a plausible phone number.
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return candidate.trim();
}

function extractAddress(html: string): string | null {
  const addr = jsonField(html, "single_line_address", "street_address", "full_address");
  if (addr) return addr;
  // og:description on Place pages sometimes leads with the address.
  return null;
}

function extractWebsite(html: string): string | null {
  // FB wraps outbound links: l.facebook.com/l.php?u=<encoded>
  const wrapped = html.match(/l\.facebook\.com\/l\.php\?u=([^"&\\]+)/i);
  if (wrapped) {
    try {
      const url = decodeURIComponent(wrapped[1]);
      if (/^https?:\/\//i.test(url) && !/facebook\.com/i.test(url)) return url;
    } catch {
      /* ignore */
    }
  }
  const fromJson = jsonField(html, "website");
  if (fromJson && /^https?:\/\//i.test(fromJson) && !/facebook\.com/i.test(fromJson)) return fromJson;
  return null;
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, MAX_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize a pasted value into a canonical facebook.com URL (+ a light mbasic variant). */
function normalize(input: string): { www: string; mbasic: string } | null {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v.replace(/^\/+/, "")}`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$/i.test(u.hostname) && !/(^|\.)fb\.com$/i.test(u.hostname)) return null;
  const path = u.pathname + u.search;
  return {
    www: `https://www.facebook.com${path}`,
    // mbasic is the lightweight HTML version — often exposes public About info.
    mbasic: `https://mbasic.facebook.com${path}`,
  };
}

export async function scrapeFacebookPage(input: string): Promise<FbInfo | { error: string }> {
  const urls = normalize(input);
  if (!urls) return { error: "That doesn't look like a Facebook page URL." };

  // mbasic first (lighter, more public data), then the regular page; merge.
  const info: FbInfo = { name: null, email: null, phone: null, address: null, website: null };
  for (const url of [urls.mbasic, urls.www]) {
    const html = await fetchHtml(url);
    if (!html) continue;
    info.name ??= extractName(html);
    info.email ??= extractEmail(html);
    info.phone ??= extractPhone(html);
    info.address ??= extractAddress(html);
    info.website ??= extractWebsite(html);
    // Got the essentials — stop early.
    if (info.name && info.phone && info.address) break;
  }

  if (!info.name && !info.phone && !info.address && !info.email) {
    return { error: "Couldn't read public details from that page (Facebook may require login). Fill in manually." };
  }
  return info;
}
