/**
 * Neighborhood Partner commission rules. Pure, so every money rule is tested
 * without a database.
 *
 * Money is integer CENTAVOS throughout (exact; never float). A commission rate
 * is integer basis points: 1000 = 10.00%.
 *
 * Fixed rules (so partners can't argue the arithmetic):
 *  - Commission is on the goods subtotal: what the order's lines cost, less
 *    refunded lines and less the discount the shop gave. Never on delivery,
 *    COD, packaging or ASAP fees, tips or surcharges — those are pass-through.
 *  - Only orders placed through Servd's ordering pages (the online ordering
 *    website and the table QR menu). Walk-in and phone orders rung up at the
 *    cashier are never commissionable.
 *  - Only completed orders. Cancelled or refunded orders owe nothing; an entry
 *    already accrued flips to `cancelled`.
 *  - The rate and totals are snapshotted on the entry. A later change to the
 *    deal never changes a past commission.
 *  - Only a 'neighborhood' account with an ACTIVE agreement covering the
 *    order's date. A 'standard' account never has a commission calculated.
 */

export const DEFAULT_RATE_BPS = 1000; // 10%
export const DEFAULT_ACTIVATION_FEE = 1_000_000; // ₱10,000 in centavos

/** Commission in centavos, rounded half up (half away from zero for a negative adjustment). */
export function commissionFor(commissionable: number, rateBps: number): number {
  if (!Number.isFinite(commissionable) || !Number.isFinite(rateBps)) return 0;
  const c = Math.trunc(commissionable);
  const r = Math.trunc(rateBps);
  if (c < 0) return -commissionFor(-c, r);
  return Math.floor((c * r + 5000) / 10000);
}

export interface CommissionLine {
  quantity: number;
  unitPrice: number; // centavos, the base snapshot
  modifiers?: { priceDeltaAtTime: number }[];
  refundedAmount?: number | null; // centavos handed back on this line
}

/** The goods subtotal a commission is charged on: lines, less refunds, less the discount. */
export function commissionableTotal(lines: CommissionLine[], discountAmount: number | null | undefined): number {
  let goods = 0;
  for (const l of lines) {
    const unit = l.unitPrice + (l.modifiers ?? []).reduce((s, m) => s + m.priceDeltaAtTime, 0);
    goods += Math.max(0, l.quantity) * unit - Math.max(0, l.refundedAmount ?? 0);
  }
  return Math.max(0, goods - Math.max(0, discountAmount ?? 0));
}

/** Order sources that came through a Servd ordering page. POS (walk-in, phone) is null. */
export const PLATFORM_SOURCES = ["web", "qr"] as const;

export function isPlatformOrder(source: string | null | undefined): boolean {
  return !!source && (PLATFORM_SOURCES as readonly string[]).includes(source);
}

/** A completed order: closed, and not refunded. */
export function isCompletedOrder(o: { status: string; paymentStatus: string }): boolean {
  return o.status === "closed" && o.paymentStatus !== "refunded";
}

/** An order that owes nothing after all: cancelled or refunded. */
export function isVoidedOrder(o: { status: string; paymentStatus: string }): boolean {
  return o.status === "cancelled" || o.paymentStatus === "refunded";
}

export interface AgreementLike {
  status: string;
  startsOn: Date | string;
  endsOn: Date | string | null;
}

/** The Manila calendar date of an instant, "YYYY-MM-DD". */
export function manilaDate(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A DATE column (stored as UTC midnight) → "YYYY-MM-DD". */
export function dateOnly(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

/** Does an active agreement cover an order placed at this instant (Manila dates, inclusive)? */
export function agreementCovers(a: AgreementLike, orderedAt: Date | string): boolean {
  if (a.status !== "active") return false;
  const day = manilaDate(orderedAt);
  if (day < dateOnly(a.startsOn)) return false;
  if (a.endsOn && day > dateOnly(a.endsOn)) return false;
  return true;
}

/**
 * The single guard every accrual passes: a neighborhood account, an active
 * agreement covering the order date, a platform order, completed.
 */
export function owesCommission(
  restaurant: { commercialTrack: string | null | undefined },
  agreement: AgreementLike | null | undefined,
  order: { source: string | null; status: string; paymentStatus: string; createdAt: Date | string },
): boolean {
  if (restaurant.commercialTrack !== "neighborhood") return false;
  if (!agreement || !agreementCovers(agreement, order.createdAt)) return false;
  return isPlatformOrder(order.source) && isCompletedOrder(order);
}

/** "online" when an online gateway took the money, else "cod" (paid the shop directly). */
export function paymentMethodOf(payments: { gateway: string; status: string }[]): "online" | "cod" {
  return payments.some((p) => p.status === "paid" && (p.gateway === "xendit" || p.gateway === "paymongo"))
    ? "online"
    : "cod";
}

// ------------------------------------------------------------- periods

/** A Manila calendar month "YYYY-MM" → its first and last day, and the UTC instants bounding it. */
export function monthPeriod(month: string): { periodStart: string; periodEnd: string; from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const periodStart = `${m[1]}-${m[2]}-01`;
  const periodEnd = `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`;
  const from = new Date(`${periodStart}T00:00:00+08:00`);
  const to = new Date(new Date(`${periodEnd}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000);
  return { periodStart, periodEnd, from, to };
}

/** The Manila month an instant falls in, "YYYY-MM". */
export function manilaMonth(at: Date = new Date()): string {
  return manilaDate(at).slice(0, 7);
}

/** The month before a "YYYY-MM". */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Add days to a "YYYY-MM-DD". */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------- weeks

/**
 * Commission is paid weekly, every Saturday. A Saturday's statement covers the
 * seven days before it — Saturday to Friday, Manila time — and is due that
 * Saturday.
 */

/** Day of the week of a "YYYY-MM-DD" (0 = Sunday … 6 = Saturday). */
export function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

export function isSaturday(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && weekday(day) === 6;
}

/** The week a Saturday's statement covers: the Saturday before to the Friday before. */
export function weekPeriod(dueSaturday: string): { periodStart: string; periodEnd: string; dueOn: string; from: Date; to: Date } | null {
  if (!isSaturday(dueSaturday)) return null;
  const periodStart = addDays(dueSaturday, -7);
  const periodEnd = addDays(dueSaturday, -1);
  return {
    periodStart,
    periodEnd,
    dueOn: dueSaturday,
    from: new Date(`${periodStart}T00:00:00+08:00`),
    to: new Date(`${dueSaturday}T00:00:00+08:00`),
  };
}

/** The Saturday this Manila day's orders will be billed on (the next Saturday after it). */
export function billingSaturday(day: string): string {
  return addDays(day, 7 - ((weekday(day) + 1) % 7));
}

/** The most recent Saturdays (today included when it is one), newest first. */
export function recentSaturdays(today: string, n: number): string[] {
  let sat = addDays(today, -((weekday(today) + 1) % 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(sat);
    sat = addDays(sat, -7);
  }
  return out;
}

// ------------------------------------------------------------- statements

export type StatementStatus = "draft" | "issued" | "partially_paid" | "paid" | "written_off";

/** A payment against an issued statement: the new amount paid and status. */
export function applyPayment(
  s: { status: string; commissionDue: number; amountPaid: number },
  amount: number,
): { ok: true; amountPaid: number; status: StatementStatus } | { ok: false; error: string } {
  if (s.status !== "issued" && s.status !== "partially_paid") {
    return { ok: false, error: "Only an issued statement can take a payment." };
  }
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Enter the amount paid." };
  const paid = s.amountPaid + amount;
  return { ok: true, amountPaid: paid, status: paid >= s.commissionDue ? "paid" : "partially_paid" };
}

/** An issued statement is never edited: only payments and a write-off change it. */
export function isStatementLocked(status: string): boolean {
  return status !== "draft";
}

export interface AgingRow {
  id: string;
  balance: number;
  dueAt: string | null;
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export function daysOverdue(dueAt: string | null, today: string): number {
  if (!dueAt) return 0;
  const ms = new Date(`${today}T00:00:00Z`).getTime() - new Date(`${dueAt}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function agingBucket(dueAt: string | null, today: string): AgingBucket {
  const d = daysOverdue(dueAt, today);
  if (d === 0) return "current";
  if (d <= 30) return "1-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

/** Outstanding balances by how overdue they are — the collections queue. */
export function agingSummary(rows: AgingRow[], today: string): Record<AgingBucket, number> {
  const out: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const r of rows) out[agingBucket(r.dueAt, today)] += Math.max(0, r.balance);
  return out;
}

// ------------------------------------------------------------- campaigns & payback

/** Internal cost per household reached, centavos. Null until both are known. */
export function costPerHousehold(c: { quantity: number; unitCost: number | null; householdsCovered: number | null }): number | null {
  if (c.unitCost == null || !c.householdsCovered) return null;
  return Math.round((c.quantity * c.unitCost) / c.householdsCovered);
}

/** Orders per 100 magnets — the number that says whether 500 is the right drop size. */
export function ordersPer100(magnetOrders: number, magnets: number): number | null {
  if (!magnets) return null;
  return Math.round((magnetOrders / magnets) * 1000) / 10;
}

/**
 * Has the territory paid back? Commission earned against the activation fee
 * plus what the magnets cost, as the brief defines it.
 */
export function payback(commissionEarned: number, activationFee: number, magnetCost: number) {
  const target = activationFee + magnetCost;
  return { target, earned: commissionEarned, reached: commissionEarned >= target, remaining: Math.max(0, target - commissionEarned) };
}

// ------------------------------------------------------------- attribution

export const SOURCE_CHANNELS = ["magnet_qr", "table_qr", "link", "messenger", "direct"] as const;
export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

const SRC_PARAM: Record<string, SourceChannel> = {
  magnet: "magnet_qr",
  magnet_qr: "magnet_qr",
  link: "link",
  messenger: "messenger",
  fb: "messenger",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?src=magnet&t=<territory>` → what to remember. Unknown values are ignored. */
export function parseAttribution(src: unknown, t: unknown): { sourceChannel: SourceChannel; territoryId: string | null } | null {
  const channel = typeof src === "string" ? SRC_PARAM[src.trim().toLowerCase()] : undefined;
  if (!channel) return null;
  const territoryId = typeof t === "string" && UUID_RE.test(t.trim()) ? t.trim().toLowerCase() : null;
  return { sourceChannel: channel, territoryId };
}

/** The attribution cookie's value, and back. */
export const ATTRIBUTION_COOKIE = "servd_attr";

export function encodeAttribution(a: { sourceChannel: SourceChannel; territoryId: string | null }): string {
  return `${a.sourceChannel}|${a.territoryId ?? ""}`;
}

export function decodeAttribution(raw: string | null | undefined): { sourceChannel: SourceChannel; territoryId: string | null } | null {
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw); // the browser stores it encoded; a reader may or may not decode it
  } catch {
    /* already plain */
  }
  const [ch, t] = value.split("|");
  if (!(SOURCE_CHANNELS as readonly string[]).includes(ch)) return null;
  return { sourceChannel: ch as SourceChannel, territoryId: t && UUID_RE.test(t) ? t.toLowerCase() : null };
}

/** The magnet's link: the partner's ordering page with the campaign parameters. */
export function magnetUrl(orderingUrl: string, territoryId: string): string {
  const u = new URL(orderingUrl);
  u.searchParams.set("src", "magnet");
  u.searchParams.set("t", territoryId);
  return u.toString();
}

/** "10.00%" from basis points. */
export function formatRate(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** "10" or "12.5" (percent, as typed) → basis points. */
export function parseRatePercent(raw: unknown): number | null {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

/**
 * A confirmed payment, applied to open statements oldest first. Whatever is
 * left over (paid ahead, or more than was owed) becomes a credit.
 */
export function allocatePayment(
  amount: number,
  statements: { id: string; commissionDue: number; amountPaid: number }[],
): { applied: { id: string; amount: number }[]; credit: number } {
  let left = Math.max(0, Math.trunc(amount));
  const applied: { id: string; amount: number }[] = [];
  for (const s of statements) {
    if (left <= 0) break;
    const owed = Math.max(0, s.commissionDue - s.amountPaid);
    if (owed <= 0) continue;
    const take = Math.min(owed, left);
    applied.push({ id: s.id, amount: take });
    left -= take;
  }
  return { applied, credit: left };
}
