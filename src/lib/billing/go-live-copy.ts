/**
 * What the self-build funnel says about going live.
 *
 * Two versions, because there are two real states: before the ₱800 All Access
 * plan exists in the database, going live is still the ₱499 one-time
 * activation; once it exists, going live is a free 30-day trial and then ₱800
 * a month. The screens are told which is in force rather than assuming — a
 * button promising "free for 30 days" that opens a ₱499 checkout, or the
 * reverse, is the failure this exists to prevent.
 *
 * Pure strings, so both versions are checked by the tests.
 */

import { formatPeso } from "@/lib/money";
import { ALL_ACCESS_PRICE, ALL_ACCESS_TRIAL_DAYS } from "./all-access";

export type GoLiveMode = "trial" | "activation";

export interface GoLiveCopy {
  /** The last line of the "what you get" list. */
  perk: string;
  button: string;
  busy: string;
  footnote: string;
}

const MONTHLY = formatPeso(ALL_ACCESS_PRICE).replace(/\.00$/, "");

export function goLiveCopy(mode: GoLiveMode): GoLiveCopy {
  if (mode === "trial") {
    return {
      perk: `Free for ${ALL_ACCESS_TRIAL_DAYS} days, then ${MONTHLY} a month for everything`,
      button: `Go live — free for ${ALL_ACCESS_TRIAL_DAYS} days`,
      busy: "Going live…",
      footnote: `Nothing to pay today. After ${ALL_ACCESS_TRIAL_DAYS} days it's ${MONTHLY} a month.`,
    };
  }
  return {
    perk: "Yours for life — one payment, no monthly fees",
    button: "Activate for ₱499",
    busy: "Opening payment…",
    footnote: "One-time. Pay with GCash or card.",
  };
}

/**
 * The line on the success page once the account is live. Decided by what
 * actually happened to THIS account — a ₱499 that was paid still gets "yours
 * for life", whichever model is current.
 */
export function wentLiveLine(paid: boolean): string {
  return paid
    ? "Your online ordering system is yours for life — one payment, no monthly fees."
    : `Your ${ALL_ACCESS_TRIAL_DAYS}-day free trial has started — every feature is on. After that it's ${MONTHLY} a month.`;
}
