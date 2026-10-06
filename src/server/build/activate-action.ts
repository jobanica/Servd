"use server";

import { currentBuild } from "./session";
import { getBuildState, MIN_PREVIEW_ITEMS } from "./queries";
import { rateLimit } from "./rate-limit";
import { activateOnTrial, allAccessLive, createActivationCheckout } from "./activation";

/**
 * Step ④ — "Go live". On the ₱800 All Access plan this activates straight onto
 * the 30-day trial; before that plan exists it is the old "Activate for ₱499"
 * checkout, which never marks anything paid itself — only the verified webhook
 * can (see activation.ts).
 */
export async function requestActivation(): Promise<
  { ok: true; checkoutUrl: string; requestId: string } | { ok: false; error: string }
> {
  const ctx = await currentBuild();
  if (!ctx) return { ok: false, error: "We couldn't find your preview. Please rebuild it." };

  const limited = await rateLimit("build:activate");
  if (!limited.ok) return { ok: false, error: limited.error! };

  const state = await getBuildState(ctx.token);
  if (!state) return { ok: false, error: "We couldn't find your preview. Please rebuild it." };
  if (state.items.length < MIN_PREVIEW_ITEMS) {
    return { ok: false, error: `Add at least ${MIN_PREVIEW_ITEMS} menu items first.` };
  }

  // New accounts go live free on the ₱800 All Access trial and are billed when
  // it ends. The browser is sent straight to the success page, which already
  // polls the request and shows the login — the same place a paid activation
  // lands after Xendit, so nothing downstream needed to change.
  //
  // Until the All Access plan exists (migration not run), the old ₱499
  // checkout is used unchanged rather than giving accounts away.
  if (await allAccessLive()) {
    const live = await activateOnTrial(ctx.restaurantId);
    if (!live.ok) return live;
    return {
      ok: true,
      checkoutUrl: `/build/success?r=${live.requestId}`,
      requestId: live.requestId,
    };
  }

  const res = await createActivationCheckout(ctx.restaurantId);
  if (!res.ok) return res;
  return { ok: true, checkoutUrl: res.checkout.checkoutUrl, requestId: res.checkout.requestId };
}
