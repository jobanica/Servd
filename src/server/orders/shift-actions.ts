"use server";

import { requireStaff } from "@/server/tenancy/current-user";
import { staffLabel } from "@/server/tenancy/staff-name";
import { pesosToCentavos } from "@/lib/money";
import { validateOpeningFloat } from "@/lib/orders/opening-float";
import { endShift, openShift } from "./shift-session";

export type EndShiftState = { ok?: boolean; error?: string } | null;
export type OpenShiftState = { ok?: boolean; error?: string } | null;

/**
 * Open the till for this cashier, counting in the revolving fund.
 *
 * The amount is what they physically put in the drawer, so the figure at the
 * end of the shift is what should physically be there. Zero is allowed and
 * means exactly that — a till that starts empty — which is different from the
 * null a shift gets when a payment opened it by itself.
 */
export async function openMyShift(
  _prev: OpenShiftState,
  formData: FormData,
): Promise<OpenShiftState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { error: "Not allowed." };
  }

  const raw = String(formData.get("openingFloatPesos") ?? "").trim();
  const error = validateOpeningFloat(raw);
  if (error) return { error };

  const shift = await openShift(
    staff.restaurantId,
    staff.staffUserId,
    pesosToCentavos(Number(raw)),
    () => staffLabel(staff.restaurantId, staff.staffUserId),
  );
  // A shift that won't open would leave the till unusable, so say so plainly
  // rather than returning a silent no-op the cashier can only read as a dead
  // button.
  return shift ? { ok: true } : { error: "Couldn't open the shift. Try again." };
}

/**
 * Close the current cashier's shift.
 *
 * Called AFTER the Z-report has printed — once the shift is closed its takings
 * are no longer reachable as "current", so printing first is the difference
 * between a cashier having their numbers and having to go ask the owner.
 *
 * Signing out is left to the caller: closing the shift and ending the session
 * are separate things, and a cashier who closes their drawer to hand over to
 * the next shift shouldn't be forced to log out of a till they're still at.
 */
export async function endMyShift(): Promise<EndShiftState> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { error: "Not allowed." };
  }
  const closed = await endShift(staff.restaurantId, staff.staffUserId);
  return closed ? { ok: true } : { error: "No open shift to close." };
}
