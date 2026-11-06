"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { systemDb } from "@/server/tenancy/scoped-db";
import { requireOwnerAction } from "@/server/tenancy/require-admin";
import { syncCommissions } from "@/server/neighborhood/accrual";
import {
  confirmCommissionPayment,
  createAdjustment,
  generateStatement,
  rejectCommissionPayment,
  issueStatement,
  recordStatementPayment,
  writeOffStatement,
} from "@/server/neighborhood/statements";
import { parseRatePercent } from "@/lib/neighborhood/commission";

/**
 * Super-admin actions for the neighborhood module. Founder-only: every one
 * re-checks requireOwnerAction, since a POST reaches an action whether or not
 * the page offered it. Each ends by sending the browser back where it came
 * from with ?ok= or ?error=, which the page shows.
 */

const BASE = "/super-admin/neighborhood";

function back(fd: FormData): string {
  const b = String(fd.get("back") ?? "");
  return b.startsWith(BASE) && !b.includes("//") ? b : BASE;
}

function done(fd: FormData, result: { ok: true } | { ok: false; error: string }, okMsg: string): never {
  revalidatePath(BASE, "layout");
  // Back where it came from, filters and all, with the outcome added.
  const [path, query = ""] = back(fd).split("?");
  const params = new URLSearchParams(query);
  params.delete("ok");
  params.delete("error");
  if (result.ok) params.set("ok", okMsg);
  else params.set("error", result.error);
  redirect(`${path}?${params.toString()}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
const optInt = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
/** Pesos as typed → centavos (null when blank or not a number). */
const optCentavos = (fd: FormData, k: string, allowNegative = false) => {
  const v = str(fd, k).replace(/[₱,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || (!allowNegative && n < 0)) return null;
  return Math.round(n * 100);
};
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const day = (v: string) => new Date(`${v}T00:00:00Z`);
const instant = (v: string) => (isDay(v) ? new Date(`${v}T12:00:00+08:00`) : null);

async function guard(fd: FormData) {
  try {
    await requireOwnerAction();
  } catch {
    done(fd, { ok: false, error: "Only the owner account can change neighborhood partners." }, "");
  }
}

// ------------------------------------------------------------- territories

const TERRITORY_STATUSES = ["prospect", "active", "paused", "closed"];

export async function saveTerritory(fd: FormData): Promise<void> {
  await guard(fd);
  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) done(fd, { ok: false, error: "Give the territory a name." }, "");
  const status = TERRITORY_STATUSES.includes(str(fd, "status")) ? str(fd, "status") : "prospect";
  const data = {
    name: name.slice(0, 120),
    city: optStr(fd, "city"),
    province: optStr(fd, "province"),
    householdEstimate: optInt(fd, "householdEstimate"),
    status,
    notes: optStr(fd, "notes"),
  };
  await systemDb((tx) =>
    id ? tx.territory.update({ where: { id }, data, select: { id: true } }) : tx.territory.create({ data, select: { id: true } }),
  );
  done(fd, { ok: true }, id ? "Territory saved." : "Territory added.");
}

// ------------------------------------------------------------- agreements

const AGREEMENT_STATUSES = ["pending", "active", "paused", "ended"];

function exclusiveClash(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createAgreement(fd: FormData): Promise<void> {
  await guard(fd);
  const territoryId = str(fd, "territoryId");
  const slug = str(fd, "restaurantSlug").toLowerCase();
  const category = (str(fd, "category") || "food").toLowerCase().replace(/[^a-z_]/g, "").slice(0, 30) || "food";
  const rate = parseRatePercent(str(fd, "ratePercent") || "10");
  const fee = optCentavos(fd, "activationFee") ?? 1_000_000;
  const startsOn = str(fd, "startsOn");
  const endsOn = str(fd, "endsOn");
  const status = AGREEMENT_STATUSES.includes(str(fd, "status")) ? str(fd, "status") : "pending";
  if (!territoryId) done(fd, { ok: false, error: "Choose a territory." }, "");
  if (rate == null) done(fd, { ok: false, error: "Enter a commission rate between 0 and 100%." }, "");
  if (!isDay(startsOn)) done(fd, { ok: false, error: "Enter the start date." }, "");
  if (endsOn && (!isDay(endsOn) || endsOn < startsOn)) done(fd, { ok: false, error: "The end date must be on or after the start." }, "");

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug }, select: { id: true } }),
  );
  if (!restaurant) done(fd, { ok: false, error: `No restaurant with the slug "${slug}".` }, "");

  try {
    await systemDb(async (tx) => {
      await tx.territoryPartner.create({
        data: {
          territoryId,
          restaurantId: restaurant!.id,
          category,
          activationFee: fee,
          commissionRateBps: rate!,
          exclusive: fd.get("exclusive") === "on",
          startsOn: day(startsOn),
          endsOn: endsOn ? day(endsOn) : null,
          status,
          notes: optStr(fd, "notes"),
        },
        select: { id: true },
      });
      // Only an agreement made live moves the account onto the neighborhood
      // track; a pending one leaves it exactly as it is.
      if (status === "active") {
        await tx.restaurant.update({ where: { id: restaurant!.id }, data: { commercialTrack: "neighborhood" }, select: { id: true } });
      }
    });
  } catch (e) {
    if (exclusiveClash(e)) {
      done(fd, { ok: false, error: `This territory already has an active exclusive "${category}" partner. End or pause that agreement first.` }, "");
    }
    throw e;
  }
  done(fd, { ok: true }, "Agreement created.");
}

export async function updateAgreement(fd: FormData): Promise<void> {
  await guard(fd);
  const id = str(fd, "id");
  const rate = parseRatePercent(str(fd, "ratePercent"));
  const fee = optCentavos(fd, "activationFee");
  const startsOn = str(fd, "startsOn");
  const endsOn = str(fd, "endsOn");
  const status = str(fd, "status");
  if (rate == null) done(fd, { ok: false, error: "Enter a commission rate between 0 and 100%." }, "");
  if (fee == null) done(fd, { ok: false, error: "Enter the activation fee." }, "");
  if (!isDay(startsOn)) done(fd, { ok: false, error: "Enter the start date." }, "");
  if (endsOn && (!isDay(endsOn) || endsOn < startsOn)) done(fd, { ok: false, error: "The end date must be on or after the start." }, "");
  if (!AGREEMENT_STATUSES.includes(status)) done(fd, { ok: false, error: "Choose a status." }, "");

  const current = await systemDb((tx) =>
    tx.territoryPartner.findFirst({ where: { id }, select: { status: true, restaurantId: true } }),
  );
  if (!current) done(fd, { ok: false, error: "Agreement not found." }, "");
  // Leaving 'active': accrue what it earned up to now first, so nothing completed
  // under the agreement is lost when it stops counting.
  if (current!.status === "active" && status !== "active") {
    await syncCommissions({ partnerId: id }).catch(() => null);
  }

  try {
    await systemDb(async (tx) => {
      // A rate change applies from here on: entries keep the rate they were written with.
      await tx.territoryPartner.update({
        where: { id },
        data: {
          commissionRateBps: rate!,
          activationFee: fee!,
          exclusive: fd.get("exclusive") === "on",
          startsOn: day(startsOn),
          endsOn: endsOn ? day(endsOn) : null,
          status,
          notes: optStr(fd, "notes"),
        },
        select: { id: true },
      });
      if (status === "active") {
        await tx.restaurant.update({ where: { id: current!.restaurantId }, data: { commercialTrack: "neighborhood" }, select: { id: true } });
      }
    });
  } catch (e) {
    if (exclusiveClash(e)) {
      done(fd, { ok: false, error: "Another active exclusive partner already holds this territory and category." }, "");
    }
    throw e;
  }
  done(fd, { ok: true }, "Agreement saved.");
}

/** Put an account back on the standard track (or onto neighborhood) by hand. */
export async function setCommercialTrack(fd: FormData): Promise<void> {
  await guard(fd);
  const restaurantId = str(fd, "restaurantId");
  const track = str(fd, "track") === "neighborhood" ? "neighborhood" : "standard";
  await systemDb((tx) => tx.restaurant.update({ where: { id: restaurantId }, data: { commercialTrack: track }, select: { id: true } }));
  done(fd, { ok: true }, track === "standard" ? "Back on the standard track — no commission from here on." : "On the neighborhood track.");
}

// ------------------------------------------------------------- activation fee

export async function recordActivation(fd: FormData): Promise<void> {
  await guard(fd);
  const id = str(fd, "id");
  if (fd.get("clear") === "1") {
    await systemDb((tx) =>
      tx.territoryPartner.update({ where: { id }, data: { activationPaidAt: null, activationMethod: null, activationRef: null }, select: { id: true } }),
    );
    done(fd, { ok: true }, "Activation marked unpaid.");
  }
  const paidOn = instant(str(fd, "paidOn"));
  if (!paidOn) done(fd, { ok: false, error: "Enter the date it was paid." }, "");
  await systemDb((tx) =>
    tx.territoryPartner.update({
      where: { id },
      data: { activationPaidAt: paidOn, activationMethod: optStr(fd, "method"), activationRef: optStr(fd, "ref") },
      select: { id: true },
    }),
  );
  done(fd, { ok: true }, "Activation fee recorded.");
}

// ------------------------------------------------------------- campaigns

export async function saveCampaign(fd: FormData): Promise<void> {
  await guard(fd);
  const id = str(fd, "id");
  const partnerId = str(fd, "partnerId");
  const data = {
    quantity: optInt(fd, "quantity") ?? 500,
    printedAt: instant(str(fd, "printedAt")),
    distributionStartedAt: instant(str(fd, "distributionStartedAt")),
    distributionCompletedAt: instant(str(fd, "distributionCompletedAt")),
    householdsCovered: optInt(fd, "householdsCovered"),
    unitCost: optCentavos(fd, "unitCost"),
    distributor: optStr(fd, "distributor"),
    notes: optStr(fd, "notes"),
  };
  await systemDb((tx) =>
    id
      ? tx.distributionCampaign.update({ where: { id }, data, select: { id: true } })
      : tx.distributionCampaign.create({ data: { ...data, territoryPartnerId: partnerId }, select: { id: true } }),
  );
  done(fd, { ok: true }, id ? "Campaign saved." : "Campaign added.");
}

// ------------------------------------------------------------- ledger

/** Run accrual now (all partners, or one). */
export async function syncNow(fd: FormData): Promise<void> {
  await guard(fd);
  const partnerId = str(fd, "partnerId") || undefined;
  const r = await syncCommissions({ partnerId });
  done(fd, { ok: true }, `Synced: ${r.accrued} new, ${r.cancelled} cancelled.`);
}

/** Entries not on an issued statement may still change state. */
const OPEN = { OR: [{ statementId: null }, { statement: { status: "draft" } }] };

export async function confirmEntries(fd: FormData): Promise<void> {
  await guard(fd);
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) done(fd, { ok: false, error: "Tick the entries to confirm." }, "");
  const r = await systemDb((tx) =>
    tx.commissionEntry.updateMany({ where: { id: { in: ids }, state: "pending", ...OPEN }, data: { state: "confirmed" } }),
  );
  done(fd, { ok: true }, `${r.count} confirmed.`);
}

export async function disputeEntry(fd: FormData): Promise<void> {
  await guard(fd);
  const note = str(fd, "note");
  if (!note) done(fd, { ok: false, error: "Add a note saying what's disputed." }, "");
  const r = await systemDb((tx) =>
    tx.commissionEntry.updateMany({
      where: { id: str(fd, "id"), state: { in: ["pending", "confirmed"] }, ...OPEN },
      // Off any draft: a disputed line is excluded until it's resolved.
      data: { state: "disputed", disputeNote: note.slice(0, 500), statementId: null },
    }),
  );
  done(fd, r.count ? { ok: true } : { ok: false, error: "That entry can't be disputed now." }, "Marked disputed.");
}

export async function resolveEntry(fd: FormData): Promise<void> {
  await guard(fd);
  const outcome = str(fd, "outcome") === "waived" ? "waived" : "confirmed";
  const r = await systemDb((tx) =>
    tx.commissionEntry.updateMany({
      where: { id: str(fd, "id"), state: { in: ["disputed", "pending"] }, ...OPEN },
      data: { state: outcome, statementId: null },
    }),
  );
  done(fd, r.count ? { ok: true } : { ok: false, error: "That entry can't be changed now." }, outcome === "waived" ? "Waived." : "Confirmed.");
}

export async function addAdjustment(fd: FormData): Promise<void> {
  await guard(fd);
  const amount = optCentavos(fd, "amount", true);
  if (amount == null) done(fd, { ok: false, error: "Enter the amount (negative for a credit)." }, "");
  done(fd, await createAdjustment(str(fd, "partnerId"), amount!, str(fd, "note")), "Adjustment added to the next statement.");
}

// ------------------------------------------------------------- statements

export async function generateStatementAction(fd: FormData): Promise<void> {
  await guard(fd);
  const r = await generateStatement(str(fd, "partnerId"), str(fd, "saturday"));
  done(fd, r.ok ? { ok: true } : r, "Draft statement ready to review.");
}

export async function issueStatementAction(fd: FormData): Promise<void> {
  await guard(fd);
  const dueOn = str(fd, "dueOn");
  done(fd, await issueStatement(str(fd, "id"), isDay(dueOn) ? { dueOn } : { dueDays: optInt(fd, "dueDays") ?? 0 }), "Statement issued.");
}

export async function recordPaymentAction(fd: FormData): Promise<void> {
  await guard(fd);
  const amount = optCentavos(fd, "amount");
  if (!amount) done(fd, { ok: false, error: "Enter the amount paid." }, "");
  done(fd, await recordStatementPayment(str(fd, "id"), amount!), "Payment recorded.");
}

export async function writeOffAction(fd: FormData): Promise<void> {
  await guard(fd);
  done(fd, await writeOffStatement(str(fd, "id"), str(fd, "reason")), "Written off.");
}

// ------------------------------------------------------------- partner payments

export async function confirmPaymentAction(fd: FormData): Promise<void> {
  await guard(fd);
  done(fd, await confirmCommissionPayment(str(fd, "id")), "Payment confirmed and applied to the oldest unpaid weeks.");
}

export async function rejectPaymentAction(fd: FormData): Promise<void> {
  await guard(fd);
  done(fd, await rejectCommissionPayment(str(fd, "id"), str(fd, "reason")), "Payment rejected — the partner sees the reason.");
}
