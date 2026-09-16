/**
 * Who in HR may see and change what.
 *
 * A manager runs the roster — schedules, leave, attendance, timesheets — and
 * that job does not require knowing what anyone earns. Pay is between the
 * employee and the owner, and a manager who can read the whole payroll knows
 * what every colleague makes, which is the kind of thing that empties a
 * restaurant of staff.
 *
 * Pure, so the rules are one short file rather than a condition repeated on
 * every screen and action that touches money.
 */

export type HrRole = "admin" | "manager";

/** Adding and removing people is the owner's decision. */
export function canAddEmployees(role: HrRole): boolean {
  return role === "admin";
}

/** Payroll runs, deductions and contribution settings — owner only. */
export function canAccessPayroll(role: HrRole): boolean {
  return role === "admin";
}

/**
 * May this person see this pay rate?
 *
 * Their own, yes — everyone is entitled to know what they earn, and hiding it
 * from a manager looking at their own record would be strange rather than
 * safe. Anyone else's, only the owner.
 */
export function canSeePay(role: HrRole, isSelf: boolean): boolean {
  return role === "admin" || isSelf;
}

/**
 * May this person CHANGE a pay rate?
 *
 * Owner only, and deliberately not "whoever can see it". A manager can read
 * their own rate; letting that same test decide edits would let them give
 * themselves a raise.
 */
export function canEditPay(role: HrRole): boolean {
  return role === "admin";
}

/** What to print where a pay rate would go when it isn't theirs to see. */
export const PAY_HIDDEN = "—";
