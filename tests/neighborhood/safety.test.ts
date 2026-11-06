import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The brief's safety rules, held in place. The module is additive: existing
 * restaurants must behave exactly as before, and commission must never touch
 * a standard account or an order path.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the schema change is additive", () => {
  const sql = read("prisma/manual/add-neighborhood-partners.sql");

  it("puts every existing restaurant on the standard track", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "commercialTrack" TEXT NOT NULL DEFAULT 'standard'/);
    expect(sql).toMatch(/CHECK \("commercialTrack" IN \('standard','neighborhood'\)\)/);
  });

  it("adds attribution to orders as nullable columns with no default and no foreign key", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "sourceChannel" TEXT;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "territoryId" TEXT;/);
    expect(sql).not.toMatch(/"territoryId" TEXT REFERENCES/);
  });

  it("changes no existing column or policy", () => {
    expect(sql).not.toMatch(/ALTER COLUMN/);
    expect(sql).not.toMatch(/DROP COLUMN/);
    expect(sql).not.toMatch(/ON "(orders|restaurants)"\s+FOR/);
  });

  it("enforces exclusivity and one commission per order in the database", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "territory_category_exclusive"[\s\S]*WHERE "status" = 'active' AND "exclusive" = true/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "commission_entries_order_key"\s+ON "commission_entries" \("orderId"\)/);
  });

  it("keeps money in integer centavos, never float", () => {
    const code = sql.replace(/--.*$/gm, ""); // the comments say "never float"; the columns must not be
    expect(code).not.toMatch(/\b(float|real|double precision|numeric)\b/i);
  });

  it("forces RLS on every new table", () => {
    for (const t of ["territories", "territory_partners", "distribution_campaigns", "commission_entries", "commission_statements"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE "${t}" FORCE ROW LEVEL SECURITY`));
    }
  });
});

describe("accrual", () => {
  const src = read("src/server/neighborhood/accrual.ts");

  it("reads only active agreements of neighborhood accounts", () => {
    expect(src).toMatch(/where: \{ status: "active"/);
    expect(src).toMatch(/if \(p\.restaurant\.commercialTrack !== "neighborhood"\) continue;/);
    expect(src).toMatch(/\.filter\(\(o\) => owesCommission\(p\.restaurant, p, o\)\)/);
  });

  it("can't double-charge when re-run", () => {
    expect(src).toMatch(/commissionEntries: \{ none: \{\} \}/);
    expect(src).toMatch(/createMany\(\{ data: rows, skipDuplicates: true \}\)/);
  });

  it("snapshots the rate and totals on the entry", () => {
    expect(src).toMatch(/rateBps: p\.commissionRateBps,/);
    expect(src).toMatch(/orderTotal: o\.total,/);
  });

  it("never edits a line on an issued statement when an order is cancelled later", () => {
    expect(src).toMatch(/OR: \[\{ statementId: null \}, \{ statement: \{ status: "draft" \} \}\]/);
  });

  it("is not called from any order path", () => {
    for (const p of ["src/server/orders/web-order.ts", "src/server/orders/place-order.ts", "src/server/orders/cashier.ts", "src/server/orders/merchant.ts"]) {
      expect(read(p), p).not.toMatch(/syncCommissions|commissionEntry/);
    }
  });
});

describe("attribution on the order path", () => {
  it("runs after the order exists, and writes only for neighborhood accounts", () => {
    const helper = read("src/server/neighborhood/attribution.ts");
    expect(helper).toMatch(/r\."commercialTrack" = 'neighborhood'/);
    expect(helper).toMatch(/catch \{\s*\/\* attribution is a measurement/);
    const web = read("src/server/orders/web-order.ts");
    expect(web.indexOf("recordOrderAttribution(order.id")).toBeGreaterThan(web.indexOf("order = await createWith"));
    expect(read("src/server/orders/place-order.ts")).toMatch(/recordOrderAttribution\(order\.id, "table_qr"\)/);
  });
});

describe("statements", () => {
  const src = read("src/server/neighborhood/statements.ts");

  it("only rebuild a draft, and refuse an issued month", () => {
    expect(src).toMatch(/existing && existing\.status !== "draft"/);
  });

  it("leave disputed lines off, and recompute totals at the moment of issue", () => {
    expect(src).toMatch(/state: "confirmed",\s*OR: \[\{ statementId: null \}, \{ statementId: statement\.id \}\]/);
    expect(src).toMatch(/where: \{ id: statementId, status: "draft" \},\s*data: \{ status: "issued"/);
    const issue = src.slice(src.indexOf("export async function issueStatement"));
    expect(issue.indexOf("recomputeTotals")).toBeLessThan(issue.indexOf('status: "issued"'));
  });

  it("settle every line only on full payment", () => {
    expect(src).toMatch(/if \(next\.status === "paid"\) \{\s*await tx\.commissionEntry\.updateMany\(\{ where: \{ statementId \}, data: \{ state: "settled" \} \}\)/);
  });
});

describe("who can do what", () => {
  it("super-admin actions are founder-only", () => {
    const src = read("src/server/neighborhood/actions.ts");
    expect(src).toMatch(/await requireOwnerAction\(\);/);
    const actions = src.match(/export async function \w+/g) ?? [];
    const guarded = src.match(/export async function \w+\(fd: FormData\): Promise<void> \{\s*await guard\(fd\);/g) ?? [];
    expect(guarded.length).toBe(actions.length);
  });

  it("a partner touches only its own lines, and a flag goes to review rather than waiving", () => {
    const src = read("src/server/neighborhood/partner-actions.ts");
    expect(src).toMatch(/partner: \{ restaurantId: me\.restaurantId \}/);
    expect(src).toMatch(/state: "disputed"/);
    expect(src).not.toMatch(/state: "waived"/);
  });

  it("standard accounts never see the Commission page or its link", () => {
    expect(read("src/server/neighborhood/partner.ts")).toMatch(/if \(restaurant\?\.commercialTrack !== "neighborhood"\) return null;/);
    expect(read("src/app/(platform)/admin/commission/page.tsx")).toMatch(/if \(!data\) notFound\(\);/);
    expect(read("src/app/(platform)/admin/layout.tsx")).toMatch(/neighborhood=\{restaurant\.commercialTrack === "neighborhood"\}/);
    expect(read("src/components/admin/AdminShell.tsx")).toMatch(/neighborhood && role === "admin"/);
  });

  it("the printable statement is founder-only", () => {
    expect(read("src/app/(platform)/neighborhood-statement/[id]/page.tsx")).toMatch(/user\.role !== "owner"/);
  });

  it("the nightly run is protected by CRON_SECRET and scheduled", () => {
    expect(read("src/app/api/cron/neighborhood/route.ts")).toMatch(/auth !== `Bearer \$\{secret\}`/);
    expect(read("vercel.json")).toMatch(/"\/api\/cron\/neighborhood"/);
  });
});
