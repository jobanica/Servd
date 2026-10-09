import { describe, it, expect, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  signRequest,
  signedHeaders,
  verifyRequest,
  verifyCallback,
  deliverEvent,
  retryDelayMs,
  productEventSchema,
  normalizeReferralCode,
  REF_COOKIE,
  type AgentPortalConfig,
  type ProductEvent,
} from "@/lib/agent-kit";
import { captureAgentRef } from "@/lib/agent-portal/ref-capture";
import { portalRefusedCode } from "@/lib/agent-portal/referral";
import {
  coverageOf,
  isEntitled,
  lapseAction,
  ownerNotice,
  normalizeBankReference,
  AGENT_GRACE_DAYS,
  type LapseInput,
} from "@/lib/agent-portal/lapse";

/**
 * servdph.com ↔ CANVEXIA agent portal. The contract is the portal's own code
 * (jobanica/canvexia, vendored into src/lib/agent-kit); these pin Servd's
 * side of it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SECRET = "test-secret-not-real";
const config: AgentPortalConfig = { baseUrl: "https://portal.test", productSlug: "servdph", secret: SECRET };
const RID = "3f9a1c2e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";

// ---------------------------------------------------------------------------
describe("signing", () => {
  it("is HMAC-SHA256 over timestamp.METHOD.path.body, as sha256=<hex>", () => {
    const expected = createHmac("sha256", SECRET).update('1700000000.POST./api/v1/events.{"a":1}').digest("hex");
    expect(signRequest(SECRET, "1700000000", "post", "/api/v1/events", '{"a":1}')).toBe(`sha256=${expected}`);
  });

  it("sends the three x-canvexia headers", () => {
    const h = signedHeaders({
      productSlug: "servdph", secret: SECRET, method: "POST", pathname: "/x", rawBody: "", now: new Date(1_700_000_000_000),
    });
    expect(h["x-canvexia-product"]).toBe("servdph");
    expect(h["x-canvexia-timestamp"]).toBe("1700000000");
    expect(h["x-canvexia-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  const now = new Date(1_700_000_000_000);
  const body = '{"event_id":"evt_1"}';
  const sig = signRequest(SECRET, "1700000000", "POST", "/api/portal/callback", body);
  const verify = (o: Partial<Parameters<typeof verifyRequest>[0]>) =>
    verifyRequest({
      secret: SECRET, timestamp: "1700000000", signature: sig, method: "POST",
      pathname: "/api/portal/callback", rawBody: body, now, ...o,
    });

  it("accepts the genuine request", () => expect(verify({})).toEqual({ ok: true }));

  it("rejects a replay outside ±5 minutes, in both directions", () => {
    expect(verify({ now: new Date(now.getTime() + 301_000) })).toEqual({ ok: false, reason: "stale" });
    expect(verify({ now: new Date(now.getTime() - 301_000) })).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects a tampered body, path or method", () => {
    expect(verify({ rawBody: '{"event_id":"evt_2"}' }).ok).toBe(false);
    expect(verify({ pathname: "/api/other" }).ok).toBe(false);
    expect(verify({ method: "PUT" }).ok).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verify({ secret: "another-secret" })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("verifies the raw text — re-serialised JSON of the same object fails", () => {
    const spaced = '{ "event_id": "evt_1" }';
    const s2 = signRequest(SECRET, "1700000000", "POST", "/api/portal/callback", spaced);
    expect(verify({ rawBody: spaced, signature: s2 }).ok).toBe(true);
    expect(verify({ rawBody: JSON.stringify(JSON.parse(spaced)), signature: s2 }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("referral capture", () => {
  it("normalises: uppercase, spaces and dashes dropped, 4–20 letters/digits", () => {
    expect(normalizeReferralCode(" ab-12 cd ")).toBe("AB12CD");
    expect(normalizeReferralCode("abc")).toBeNull();
    expect(normalizeReferralCode("not a code!")).toBeNull();
    expect(normalizeReferralCode("A".repeat(21))).toBeNull();
  });

  const req = (url: string, cookie?: string) =>
    new NextRequest(url, { headers: cookie ? { cookie } : {} });

  it("stores ?ref= in a 30-day httpOnly lax cookie", () => {
    const res = captureAgentRef(req("https://servdph.com/create?ref=ab-12cd"), NextResponse.next());
    const c = res.cookies.get(REF_COOKIE);
    expect(c?.value).toBe("AB12CD");
    expect(c?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe("lax");
  });

  it("first code wins — an existing cookie is never overwritten", () => {
    const res = captureAgentRef(
      req("https://servdph.com/signup?ref=SECOND1", `${REF_COOKIE}=FIRST1`),
      NextResponse.next(),
    );
    expect(res.cookies.get(REF_COOKIE)).toBeUndefined();
  });

  it("junk in ?ref= writes nothing", () => {
    const res = captureAgentRef(req("https://servdph.com/signup?ref=x"), NextResponse.next());
    expect(res.cookies.get(REF_COOKIE)).toBeUndefined();
  });

  it("drops a code only when the portal positively says no", () => {
    expect(portalRefusedCode(null)).toBe(false); // unreachable / unconfigured → keep
    expect(portalRefusedCode({ code: "AB12", valid: true, active: true, agent_name: "A" })).toBe(false);
    expect(portalRefusedCode({ code: "AB12", valid: false, active: false, agent_name: null })).toBe(true);
    expect(portalRefusedCode({ code: "AB12", valid: true, active: false, agent_name: null })).toBe(true);
  });

  it("middleware imports the Edge-safe module, never the node:crypto barrel", () => {
    const mw = read("src/middleware.ts");
    expect(mw).not.toMatch(/from "@\/lib\/agent-kit"/);
    expect(read("src/lib/agent-portal/ref-capture.ts")).toMatch(/from "@\/lib\/agent-kit\/ref"/);
  });
});

// ---------------------------------------------------------------------------
describe("the event envelope", () => {
  const signup: ProductEvent = {
    event_id: "evt_0b6c3d1e-0000-4000-8000-000000000000",
    type: "customer.signed_up",
    occurred_at: "2026-10-09T02:00:00.000Z",
    data: {
      external_customer_id: RID, business_name: "Kusina", owner_name: "Ana", owner_phone: "09171234567",
      agent_code: "AB12CD", plan: "all-access",
    },
  };

  it("matches the portal's schema, with no product field in the body", () => {
    expect(productEventSchema.safeParse(signup).success).toBe(true);
    expect(Object.keys(signup)).not.toContain("product");
  });

  it("refuses a signup without an owner phone, or without a customer id", () => {
    expect(productEventSchema.safeParse({ ...signup, data: { ...signup.data, owner_phone: "" } }).success).toBe(false);
    expect(productEventSchema.safeParse({ ...signup, data: { ...signup.data, external_customer_id: "" } }).success).toBe(false);
  });

  it("requires billing_month_start on a monthly payment", () => {
    const pay = {
      event_id: "evt_x0000000", type: "payment.submitted", occurred_at: "2026-10-09T02:00:00.000Z",
      data: { external_customer_id: RID, type: "monthly", months_covered: 1, amount: 80000, bank_reference: "REF123" },
    };
    expect(productEventSchema.safeParse(pay).success).toBe(false);
    expect(
      productEventSchema.safeParse({ ...pay, data: { ...pay.data, billing_month_start: "2026-11" } }).success,
    ).toBe(true);
  });

  it("uses the restaurant id — never an email or name — as external_customer_id", () => {
    const events = read("src/server/agent-portal/events.ts");
    expect(events).toMatch(/data: \{ external_customer_id: restaurantId, \.\.\.data \}/);
    expect(events).not.toMatch(/external_customer_id:\s*[^,}]*email/);
  });

  it("queues nothing for an account that isn't billed through the portal", () => {
    const events = read("src/server/agent-portal/events.ts");
    expect(events).toMatch(/if \(!\(await isPortalBilled\(tx, restaurantId\)\)\) return null;/);
  });
});

// ---------------------------------------------------------------------------
describe("delivery", () => {
  const event = { event_id: "evt_abcdefgh", type: "customer.reactivated", occurred_at: "2026-10-09T00:00:00Z", data: { external_customer_id: RID } } as ProductEvent;
  const reply = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status }));

  it("treats processed, pending, duplicate and refused as delivered", async () => {
    for (const s of ["processed", "pending", "duplicate", "refused"]) {
      const r = await deliverEvent(config, event, reply(200, { event_id: event.event_id, status: s }) as unknown as typeof fetch);
      expect(r.kind).toBe("delivered");
    }
  });

  it("never retries 400, 404, 413, 422", async () => {
    for (const code of [400, 404, 413, 422]) {
      const r = await deliverEvent(config, event, reply(code, { error: "x" }) as unknown as typeof fetch);
      expect(r.kind, String(code)).toBe("failed");
    }
  });

  it("retries 401 (fixed by configuration), 5xx and network errors", async () => {
    expect((await deliverEvent(config, event, reply(401, {}) as unknown as typeof fetch)).kind).toBe("retry");
    expect((await deliverEvent(config, event, reply(503, {}) as unknown as typeof fetch)).kind).toBe("retry");
    const boom = vi.fn(async () => { throw new Error("ECONNRESET"); });
    expect((await deliverEvent(config, event, boom as unknown as typeof fetch)).kind).toBe("retry");
  });

  it("signs what it sends, for the events path", async () => {
    const f = reply(200, { status: "processed" });
    await deliverEvent(config, event, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://portal.test/api/v1/events");
    const h = init.headers as Record<string, string>;
    expect(
      verifyRequest({
        secret: SECRET, timestamp: h["x-canvexia-timestamp"], signature: h["x-canvexia-signature"],
        method: "POST", pathname: "/api/v1/events", rawBody: init.body as string,
      }).ok,
    ).toBe(true);
  });

  it("backs off 30s × 2^(n-1), capped at six hours", () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(5)).toBe(480_000);
    expect(retryDelayMs(30)).toBe(6 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
describe("per-customer ordering", () => {
  const sql = read("src/server/agent-portal/outbox.ts");

  it("claims only the oldest pending event per customer, and only if due", () => {
    expect(sql).toMatch(/SELECT DISTINCT ON \("restaurantId"\)/);
    expect(sql).toMatch(/ORDER BY "restaurantId", "createdAt", id/);
    expect(sql).toMatch(/WHERE "nextAttemptAt" <= \$\{now\}/);
  });

  it("the worker never runs inside a user request — only the cron drains", () => {
    for (const p of ["src/app/(platform)/signup/actions.ts", "src/server/agent-portal/owner-actions.ts"]) {
      expect(read(p), p).not.toMatch(/drainOutbox|deliverEvent/);
    }
  });
});

// ---------------------------------------------------------------------------
describe("callbacks", () => {
  const cb = {
    event_id: "cb_00000001",
    type: "payment.confirmed",
    occurred_at: "2026-10-09T02:00:00.000Z",
    data: {
      external_customer_id: RID, bank_reference: "REF123", payment_type: "monthly",
      months_covered: 1, billing_month_start: "2026-11", amount: 80000,
    },
  };
  const signed = (body: string, opts: { secret?: string; path?: string; ts?: number } = {}) => {
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    return new Request(`https://servdph.com${opts.path ?? "/api/portal/callback"}`, {
      method: "POST",
      body,
      headers: {
        "x-canvexia-product": "servdph",
        "x-canvexia-timestamp": ts,
        "x-canvexia-signature": signRequest(opts.secret ?? SECRET, ts, "POST", "/api/portal/callback", body),
      },
    });
  };

  it("verifies, then parses", () => {
    const body = JSON.stringify(cb);
    const r = verifyCallback(config, signed(body), body);
    expect(r.ok && r.callback.type).toBe("payment.confirmed");
  });

  it("401 for a wrong secret or another product's slug", () => {
    const body = JSON.stringify(cb);
    expect(verifyCallback(config, signed(body, { secret: "nope" }), body)).toMatchObject({ ok: false, status: 401 });
    expect(verifyCallback({ ...config, productSlug: "servd" }, signed(body), body)).toMatchObject({ ok: false, status: 401 });
  });

  it("422 for a rejection without a reason", () => {
    const bad = JSON.stringify({ ...cb, type: "payment.rejected", data: { external_customer_id: RID, bank_reference: "R" } });
    expect(verifyCallback(config, signed(bad), bad)).toMatchObject({ ok: false, status: 422 });
  });

  describe("the route", () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    it("503 when this deployment isn't configured", async () => {
      delete process.env.AGENT_PORTAL_SECRET;
      const { POST } = await import("@/app/api/portal/callback/route");
      const res = await POST(new Request("https://servdph.com/api/portal/callback", { method: "POST", body: "{}" }));
      expect(res.status).toBe(503);
    });

    it("401 for an unsigned POST — not a redirect to sign-in", async () => {
      process.env.AGENT_PORTAL_URL = "https://portal.test";
      process.env.AGENT_PORTAL_PRODUCT_SLUG = "servdph";
      process.env.AGENT_PORTAL_SECRET = SECRET;
      const { POST } = await import("@/app/api/portal/callback/route");
      const res = await POST(new Request("https://servdph.com/api/portal/callback", { method: "POST", body: "{}" }));
      expect(res.status).toBe(401);
    });
  });

  it("dedupes through the inbox with ON CONFLICT DO NOTHING, in the same transaction", () => {
    const src = read("src/server/agent-portal/callbacks.ts");
    expect(src).toMatch(/productCallbackInbox\.createMany\([\s\S]*skipDuplicates: true/);
    expect(src).toMatch(/if \(inserted\.count === 0\) return "duplicate";/);
    expect(read("src/app/api/portal/callback/route.ts")).toMatch(/systemDb\(\(tx\) => applyPortalCallback\(tx,/);
  });

  it("never suspends from a callback", () => {
    expect(read("src/server/agent-portal/callbacks.ts")).not.toMatch(/"suspended"/);
    expect(read("src/server/agent-portal/coverage.ts")).not.toMatch(/setRestaurantStatus\([^)]*"suspended"/);
  });
});

// ---------------------------------------------------------------------------
describe("bank references", () => {
  it("are compared in one normalised form", () => {
    expect(normalizeBankReference(" ab 12-cd ")).toBe("AB12-CD");
    expect(normalizeBankReference("AB12-CD")).toBe(normalizeBankReference("ab12-cd"));
  });

  it("a duplicate is refused with a sentence, not a constraint error", () => {
    const src = read("src/server/agent-portal/owner-actions.ts");
    expect(src).toMatch(/e\.code === "P2002"[\s\S]*DUPLICATE_REFERENCE/);
    expect(src).toMatch(/if \(clash\) return \{ status: "error", message: DUPLICATE_REFERENCE \}/);
    expect(read("prisma/manual/add-agent-portal.sql")).toMatch(/UNIQUE INDEX IF NOT EXISTS "subscription_manual_payments_bankReference_key"/);
  });

  it("an activation receipt is refused while the agreement is unsigned", () => {
    expect(read("src/server/agent-portal/owner-actions.ts")).toMatch(
      /input\.type === "activation" && state\.agent\.contractStatus !== "signed"/,
    );
  });
});

// ---------------------------------------------------------------------------
describe("coverage", () => {
  const m = (month: string, n = 1) => ({ type: "monthly", billingMonthStart: new Date(`${month}-01T00:00:00Z`), monthsCovered: n });

  it("runs to the start of the month after the last paid one (Manila)", () => {
    expect(coverageOf([m("2026-11")]).paidUntil?.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });

  it("overlapping months do not stack", () => {
    const once = coverageOf([m("2026-11")]).paidUntil;
    expect(coverageOf([m("2026-11"), m("2026-11")]).paidUntil).toEqual(once);
    expect(coverageOf([m("2026-11", 3), m("2026-12")]).paidUntil?.toISOString()).toBe("2027-01-31T16:00:00.000Z");
  });

  it("is recomputed, so a reversal simply removes the month", () => {
    const both = coverageOf([m("2026-11"), m("2026-12")]);
    const reversed = coverageOf([m("2026-11")]);
    expect(reversed.paidUntil! < both.paidUntil!).toBe(true);
  });

  it("activation covers the month it's confirmed in; monthly is due from the 1st of the next", () => {
    const activation = {
      type: "activation", billingMonthStart: null, monthsCovered: 1,
      decidedAt: new Date("2026-10-20T03:00:00Z"), // 20 Oct, Manila
    };
    const c = coverageOf([activation]);
    expect(c.activationCoversUntil?.toISOString()).toBe("2026-10-31T16:00:00.000Z"); // 1 Nov 00:00 Manila
    expect(isEntitled(c, new Date("2026-10-31T15:59:00Z"))).toBe(true);
    expect(isEntitled(c, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });

  it("an activation from long ago is not a paid-up subscription today", () => {
    const activation = { type: "activation", billingMonthStart: null, monthsCovered: 1, decidedAt: new Date("2026-01-10T00:00:00Z") };
    expect(isEntitled(coverageOf([activation, m("2026-11")]), new Date("2027-03-01T00:00:00Z"))).toBe(false);
    expect(isEntitled(coverageOf([activation, m("2027-03")]), new Date("2027-03-15T00:00:00Z"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("grace and suspension", () => {
  const paid = coverageOf([{ type: "monthly", billingMonthStart: new Date("2026-11-01T00:00:00Z"), monthsCovered: 1 }]);
  const end = paid.paidUntil!; // 1 Dec 2026 00:00 Manila
  const at = (days: number) => new Date(end.getTime() + days * 86_400_000 + 60_000);
  const input = (o: Partial<LapseInput> = {}): LapseInput => ({
    coverage: paid, trialEndsAt: null, subscriptionStatus: "active", suspended: false, ...o,
  });

  it("lapsed → past_due at once, nothing else", () => {
    expect(lapseAction(input(), at(0))).toBe("mark_past_due");
    expect(lapseAction(input({ subscriptionStatus: "past_due" }), at(3))).toBe("none");
  });

  it("day 6 is still grace; day 7 suspends", () => {
    expect(AGENT_GRACE_DAYS).toBe(7);
    expect(lapseAction(input({ subscriptionStatus: "past_due" }), at(6))).toBe("none");
    expect(lapseAction(input({ subscriptionStatus: "past_due" }), at(7))).toBe("suspend");
  });

  it("a restaurant that never activated is out of scope — it simply isn't live", () => {
    expect(lapseAction(input({ coverage: coverageOf([]) }), at(30))).toBe("none");
  });

  it("an activation with no monthly payment lapses at the end of its month", () => {
    const act = coverageOf([
      { type: "activation", billingMonthStart: null, monthsCovered: 1, decidedAt: new Date("2026-11-10T03:00:00Z") },
    ]);
    const endsAt = act.activationCoversUntil!; // 1 Dec Manila
    const day = (d: number) => new Date(endsAt.getTime() + d * 86_400_000 + 60_000);
    expect(lapseAction(input({ coverage: act }), new Date(endsAt.getTime() - 60_000))).toBe("none");
    expect(lapseAction(input({ coverage: act }), day(0))).toBe("mark_past_due");
    expect(lapseAction(input({ coverage: act, subscriptionStatus: "past_due" }), day(7))).toBe("suspend");
  });

  it("paying again restores a suspended account", () => {
    const later = coverageOf([
      { type: "monthly", billingMonthStart: new Date("2026-11-01T00:00:00Z"), monthsCovered: 1 },
      { type: "monthly", billingMonthStart: new Date("2026-12-01T00:00:00Z"), monthsCovered: 1 },
    ]);
    expect(lapseAction(input({ coverage: later, suspended: true }), at(8))).toBe("restore");
  });

  it("warns the owner before it happens, with the date", () => {
    expect(ownerNotice(input(), new Date(end.getTime() - 3 * 86_400_000))).toMatchObject({ kind: "renew_soon", daysLeft: 3 });
    const n = ownerNotice(input({ subscriptionStatus: "past_due" }), at(2));
    expect(n).toMatchObject({ kind: "past_due" });
    expect(n && n.kind === "past_due" && n.suspendsAt.getTime()).toBe(end.getTime() + 7 * 86_400_000);
  });

  it("never downgrades the plan", () => {
    for (const p of ["src/server/agent-portal/sweep.ts", "src/server/agent-portal/coverage.ts"]) {
      expect(read(p), p).not.toMatch(/planId/);
    }
  });

  it("a failing sweep does not stop the queue draining", () => {
    const route = read("src/app/api/cron/agent-portal/route.ts");
    expect(route.indexOf("suspendLapsedAccounts()")).toBeLessThan(route.indexOf("drainOutbox()"));
    expect(route).toMatch(/catch \(e\) \{\s*console\.error\("\[agent-portal\] sweep failed; draining anyway:"/);
  });
});

// ---------------------------------------------------------------------------
describe("public signup", () => {
  const page = read("src/app/(platform)/signup/page.tsx");
  const action = read("src/app/(platform)/signup/actions.ts");

  it("is open to everyone — no invite redirect", () => {
    expect(page).not.toMatch(/redirect\(/);
  });

  it("creates the restaurant NOT live, so ordering stays off until activation", () => {
    expect(action).toMatch(/status: "pending"/);
  });

  it("bills every signup through the portal, in the same transaction, agent or not", () => {
    expect(action).toMatch(/await tx\.agentAccount\.create\(\{\s*data: \{ restaurantId: restaurant\.id, agentCode, ownerName, ownerPhone: phone \}/);
    expect(action).toMatch(/await enqueueCustomerSignedUp\(tx, restaurant\.id\);/);
    expect(action).not.toMatch(/if \(agentCode\) \{\s*await tx\.agentAccount/);
  });

  it("is rate-limited, since anyone can reach it", () => {
    expect(action).toMatch(/rateLimit\("signup:create"\)/);
  });

  it("a confirmed activation puts a not-live restaurant live — without a reactivated event", () => {
    const cov = read("src/server/agent-portal/coverage.ts");
    expect(cov).toMatch(/coverage\.activationConfirmed && restaurant\?\.status === "pending"/);
    const ev = read("src/server/agent-portal/events.ts");
    expect(ev).toMatch(/before\.status === "suspended" && status === "active"/);
  });

  it("the owner is told they're not live yet, with the way to go live", () => {
    const n = ownerNotice({ coverage: coverageOf([]), trialEndsAt: null, subscriptionStatus: "trialing", suspended: false, live: false }, new Date());
    expect(n).toEqual({ kind: "not_live" });
  });
});

// ---------------------------------------------------------------------------
describe("machine endpoints bypass the auth gate", () => {
  it("middleware never runs on /api/portal or /api/cron", () => {
    const m = read("src/middleware.ts").match(/matcher: \["(.+)"\]/);
    expect(m).toBeTruthy();
    const re = new RegExp(`^${m![1].replace(/\\\\/g, "\\")}$`);
    expect(re.test("/admin/billing")).toBe(true); // sanity: it does match pages
    for (const p of ["/api/portal/callback", "/api/cron/agent-portal", "/api/webhooks/xendit"]) {
      expect(re.test(p), p).toBe(false);
    }
  });

  it("the worker is scheduled every minute", () => {
    const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    expect(crons).toContainEqual({ path: "/api/cron/agent-portal", schedule: "* * * * *" });
  });
});

// ---------------------------------------------------------------------------
describe("no commission here", () => {
  it("no commission amount, rate or tier anywhere in Servd's code", () => {
    const files = [
      "src/server/agent-portal/events.ts", "src/server/agent-portal/outbox.ts", "src/server/agent-portal/callbacks.ts",
      "src/server/agent-portal/coverage.ts", "src/server/agent-portal/sweep.ts", "src/server/agent-portal/billing.ts",
      "src/server/agent-portal/owner-actions.ts", "src/server/agent-portal/admin-actions.ts", "src/lib/agent-portal/lapse.ts",
    ];
    for (const f of files) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/commission|tier1|tier2/i);
    }
  });
});
