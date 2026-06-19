import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Referral program — RLS isolation + double-pay (idempotency) at the DATABASE
 * level. Mirrors tests/isolation. Requires a live DB with the referral migration
 * applied; skips automatically when DATABASE_URL is unset.
 *
 *   prisma db push && npm run db:rls && (apply add-referrals-track1.sql)
 *   DATABASE_URL=... npx vitest run tests/referrals/isolation.test.ts
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;
const prisma = new PrismaClient();

function asTenant<T>(restaurantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.current_restaurant_id', ${restaurantId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
function asSuper<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

let A = "";
let B = "";
let codeA = "";
let referralId = "";

d("referral program — RLS + idempotency", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const ra = await tx.restaurant.create({ data: { name: "Ref A", slug: `ref-a-${randomUUID().slice(0, 8)}`, status: "active" } });
      const rb = await tx.restaurant.create({ data: { name: "Ref B", slug: `ref-b-${randomUUID().slice(0, 8)}`, status: "active" } });
      A = ra.id;
      B = rb.id;
      const c = await tx.referralCode.create({ data: { code: `A${randomUUID().slice(0, 6).toUpperCase()}`, ownerType: "restaurant", restaurantId: A } });
      codeA = c.id;
      await tx.referralCode.create({ data: { code: `B${randomUUID().slice(0, 6).toUpperCase()}`, ownerType: "restaurant", restaurantId: B } });
      // A referred B.
      const ref = await tx.referral.create({
        data: { referralCodeId: codeA, referrerRestaurantId: A, referredRestaurantId: B, status: "signed_up" },
      });
      referralId = ref.id;
    });
  });

  afterAll(async () => {
    if (A || B) await asSuper((tx) => tx.restaurant.deleteMany({ where: { id: { in: [A, B] } } }));
    await prisma.$disconnect();
  });

  it("a restaurant sees only its own referral codes", async () => {
    const aCodes = await asTenant<any[]>(A, (tx) => tx.referralCode.findMany());
    expect(aCodes.length).toBe(1);
    expect(aCodes[0].restaurantId).toBe(A);
  });

  it("a restaurant cannot create a code in another tenant (WITH CHECK)", async () => {
    await expect(
      asTenant(A, (tx) =>
        tx.referralCode.create({ data: { code: `X${randomUUID().slice(0, 6).toUpperCase()}`, ownerType: "restaurant", restaurantId: B } }),
      ),
    ).rejects.toThrow();
  });

  it("the referrer sees the referral; the referred restaurant does not", async () => {
    const aRefs = await asTenant<any[]>(A, (tx) => tx.referral.findMany());
    const bRefs = await asTenant<any[]>(B, (tx) => tx.referral.findMany());
    expect(aRefs.length).toBe(1);
    expect(bRefs.length).toBe(0);
  });

  it("account credits are tenant-isolated", async () => {
    await asSuper((tx) =>
      tx.accountCredit.create({ data: { restaurantId: A, amount: 199900, reason: "test", sourceReferralId: referralId } }),
    );
    const aCredits = await asTenant<any[]>(A, (tx) => tx.accountCredit.findMany());
    const bCredits = await asTenant<any[]>(B, (tx) => tx.accountCredit.findMany());
    expect(aCredits.length).toBe(1);
    expect(bCredits.length).toBe(0);
  });

  it("a paid invoice yields at most one credit per restaurant per referral (idempotent)", async () => {
    // Simulate a webhook retry: insert the same referral-sourced credit twice.
    const data = [{ restaurantId: A, amount: 199900, reason: "referral", sourceReferralId: referralId }];
    await asSuper((tx) => tx.accountCredit.createMany({ data, skipDuplicates: true }));
    await asSuper((tx) => tx.accountCredit.createMany({ data, skipDuplicates: true }));
    const count = await asSuper<number>((tx) =>
      tx.accountCredit.count({ where: { restaurantId: A, sourceReferralId: referralId } }),
    );
    expect(count).toBe(1);
  });
});
