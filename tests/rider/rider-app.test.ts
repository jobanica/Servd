import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  amountDue,
  changeFor,
  directionsUrl,
  isRiderPayMethod,
  manilaDate,
  manilaDayStart,
  riderStage,
  summarizeByRider,
  summarizeDeliveries,
} from "@/lib/rider/rider";

/**
 * The Rider app: a staff role whose login opens /rider — today's delivery
 * orders with a map, "Pick up", and "Delivered" with how the customer paid
 * (cash, or GCash with a receipt photo). It keeps the rider's day and gives
 * the owner a per-rider report.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("what the rider collects", () => {
  it("is the total less discount and gift-card credit", () => {
    expect(amountDue({ total: 25_000, discountAmount: 5_000, creditApplied: 2_000 })).toBe(18_000);
    expect(amountDue({ total: 10_000, discountAmount: 20_000 })).toBe(0);
  });

  it("works out the change to bring for a cash customer", () => {
    expect(changeFor(18_000, 50_000)).toBe(32_000);
    expect(changeFor(18_000, 18_000)).toBeNull();
    expect(changeFor(18_000, null)).toBeNull();
  });

  it("accepts only cash, GCash or already paid", () => {
    expect(isRiderPayMethod("cash")).toBe(true);
    expect(isRiderPayMethod("gcash")).toBe(true);
    expect(isRiderPayMethod("prepaid")).toBe(true);
    expect(isRiderPayMethod("card")).toBe(false);
  });
});

describe("the order list", () => {
  it("knows preparing, ready and on the way", () => {
    expect(riderStage({ status: "preparing", deliveryStatus: null })).toBe("preparing");
    expect(riderStage({ status: "done", deliveryStatus: null })).toBe("ready");
    expect(riderStage({ status: "done", deliveryStatus: "out_for_delivery" })).toBe("on_the_way");
  });

  it("navigates to the pin, or to the address without the kitchen's tags", () => {
    expect(directionsUrl(14.5, 121.0, "x")).toBe("https://www.google.com/maps/dir/?api=1&destination=14.5,121");
    expect(directionsUrl(null, null, "[ASAP +₱20.00] Blk 4 Lot 7")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=Blk%204%20Lot%207",
    );
    expect(directionsUrl(null, null, null)).toBeNull();
  });
});

describe("the rider's day", () => {
  it("counts deliveries and adds up cash and GCash separately", () => {
    const s = summarizeDeliveries([
      { riderPayMethod: "cash", riderCollected: 15_000 },
      { riderPayMethod: "cash", riderCollected: 9_900 },
      { riderPayMethod: "gcash", riderCollected: 20_000 },
      { riderPayMethod: "prepaid", riderCollected: 0 },
    ]);
    expect(s).toEqual({ delivered: 4, cash: 24_900, gcash: 20_000, prepaid: 1, collected: 44_900 });
  });

  it("gives the owner one summary per rider, busiest first", () => {
    const groups = summarizeByRider([
      { riderId: "a", riderPayMethod: "cash", riderCollected: 100 },
      { riderId: "b", riderPayMethod: "cash", riderCollected: 100 },
      { riderId: "b", riderPayMethod: "gcash", riderCollected: 300 },
      { riderId: null, riderPayMethod: "cash", riderCollected: 999 },
    ]);
    expect(groups.map((g) => g.riderId)).toEqual(["b", "a"]);
    expect(groups[0].summary).toMatchObject({ delivered: 2, cash: 100, gcash: 300 });
  });

  it("reads a day in Manila time", () => {
    expect(manilaDayStart("2026-10-18")!.toISOString()).toBe("2026-10-17T16:00:00.000Z");
    expect(manilaDayStart("18/10/2026")).toBeNull();
    expect(manilaDate(new Date("2026-10-17T16:30:00.000Z"))).toBe("2026-10-18");
  });
});

describe("the server", () => {
  const src = read("src/server/rider/actions.ts");

  it("only riders and the owner can use it", () => {
    expect(src).toMatch(/const RIDER_ROLES = \["rider", "admin"\] as const;/);
    const page = read("src/app/(platform)/rider/page.tsx");
    expect(page).toMatch(/\["rider", "admin"\]\.includes\(user\.role\)/);
    expect(page).toMatch(/hasFeature\(user\.restaurantId, "onlineOrdering"\)/);
  });

  it("lets only one rider take an order", () => {
    expect(src).toMatch(/OR: \[\{ riderId: null \}, \{ riderId: me\.staffUserId \}\]/);
    expect(src).toMatch(/Another rider already took this order\./);
  });

  it("charges the server's amount, never the phone's", () => {
    expect(src).toMatch(/const due = paidAlready \? 0 : amountDue\(order\);/);
    expect(src).not.toMatch(/input\.amount/);
  });

  it("won't take GCash without a receipt photo, kept in a private bucket", () => {
    expect(src).toMatch(/Take a photo of the GCash receipt first\./);
    const storage = read("src/server/storage/rider-receipts.ts");
    expect(storage).toMatch(/ensureBucket\(supabase, RIDER_RECEIPT_BUCKET, false\)/);
    expect(storage).toMatch(/createSignedUrls/);
    // Never signs another restaurant's receipt.
    expect(storage).toMatch(/p\.startsWith\(`\$\{restaurantId\}\/`\)/);
  });

  it("books the payment under the rider, as cash or GCash", () => {
    expect(src).toMatch(/method: effective === "gcash" \? "gcash" : "cash",/);
    expect(src).toMatch(/staffUserId: me\.staffUserId,/);
  });

  it("can't mark an order paid online when it isn't", () => {
    expect(src).toMatch(/This order isn't paid yet\. Choose Cash or GCash\./);
  });
});

describe("signing in as a rider", () => {
  it("is a role the owner can give, and lands on /rider", () => {
    expect(read("src/server/staff/actions.ts")).toMatch(/"merchant", "rider", "manager"/);
    expect(read("src/components/admin/AddStaffForm.tsx")).toMatch(/<option value="rider">/);
    expect(read("src/app/(platform)/login/actions.ts")).toMatch(/if \(user\.role === "rider"\) redirect\("\/rider"\);/);
    expect(read("prisma/schema.prisma")).toMatch(/\n {2}rider \/\/ the Rider app only/);
  });

  it("can't be given an unknown role by a forged form", () => {
    expect(read("src/server/staff/actions.ts")).toMatch(/createSchema\.shape\.role\.safeParse\(formData\.get\("role"\)\)/);
  });

  it("installs as its own app", () => {
    expect(read("public/rider.webmanifest")).toMatch(/"start_url": "\/rider"/);
    expect(read("src/app/(platform)/rider/layout.tsx")).toMatch(/manifest: "\/rider\.webmanifest"/);
  });
});
