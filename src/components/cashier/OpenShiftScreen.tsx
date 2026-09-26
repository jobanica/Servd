"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { openMyShift, type OpenShiftState } from "@/server/orders/shift-actions";
import { signOut } from "@/app/(platform)/login/actions";
import { MAX_OPENING_FLOAT_PESOS } from "@/lib/orders/opening-float";
import { formatPeso, pesosToCentavos } from "@/lib/money";

/**
 * The till before anyone has opened it.
 *
 * Stands in front of the board rather than sitting in a corner of it, because
 * "open your shift first" is only a rule if the screen actually waits. The
 * money question is the whole point: the drawer already has change in it at
 * 6am, and unless someone counts that in, the figure at the end of the shift
 * is smaller than what is physically there and the count never agrees.
 *
 * Nothing here refuses a sale — the server still accepts one and attributes it
 * to a shift opened for it. This is the practice; the server is the safety net.
 */

const QUICK_PESOS = [0, 500, 1000, 2000, 5000];

export function OpenShiftScreen({
  cashierName,
  hadStaleShift,
}: {
  cashierName: string;
  /** Their last shift ran past the cap and was closed for them. Say so. */
  hadStaleShift?: boolean;
}) {
  const [state, action, pending] = useActionState<OpenShiftState, FormData>(openMyShift, null);
  const [pesos, setPesos] = useState("");
  const router = useRouter();

  // The board is rendered by the server from the shift it loaded, so once the
  // shift exists the page has to be asked again. Refresh rather than flipping a
  // local flag: everything else on the till comes from that same render.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const typed = Number(pesos);
  const preview = pesos.trim() !== "" && Number.isFinite(typed) && typed >= 0 ? typed : null;
  const input =
    "w-full rounded-xl border border-plum-ink/15 px-4 py-3 text-2xl font-bold tabular-nums";

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-tile border border-plum-ink/10 bg-white p-6 shadow-sm">
        <h1 className="font-heading text-2xl font-bold">Open your shift</h1>
        <p className="mt-1 text-sm text-plum-ink/60">
          {cashierName}, the till is closed. Count what&apos;s in the drawer now and open
          your shift to start taking orders.
        </p>

        {hadStaleShift && (
          <p className="mt-3 rounded-lg bg-mango/20 px-3 py-2 text-sm text-plum-ink/75">
            An older shift of yours was left open and will be closed when you open this
            one. Its takings stay on its own summary — this is a fresh drawer.
          </p>
        )}

        <form action={action} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-sm font-semibold text-plum-ink/70">
              Revolving fund — cash in the drawer now
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-2xl font-bold text-plum-ink/40">₱</span>
              <input
                name="openingFloatPesos"
                type="number"
                inputMode="decimal"
                min={0}
                max={MAX_OPENING_FLOAT_PESOS}
                step="0.01"
                value={pesos}
                onChange={(e) => setPesos(e.target.value)}
                placeholder="0.00"
                className={input}
                autoFocus
              />
            </div>
            <span className="mt-1 block text-xs text-plum-ink/45">
              The change you start with. It&apos;s added to your expected cash at the end
              of the shift, so the drawer and the report agree.
            </span>
          </label>

          {/* The usual amounts, one tap. A cashier opening the till at 6am
              should not be doing arithmetic on a phone keyboard. */}
          <div className="flex flex-wrap gap-2">
            {QUICK_PESOS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPesos(String(p))}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  pesos === String(p)
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                    : "border-plum-ink/15 text-plum-ink/70 hover:bg-cream"
                }`}
              >
                {p === 0 ? "Empty" : formatPeso(pesosToCentavos(p))}
              </button>
            ))}
          </div>

          {preview != null && (
            <p className="text-sm text-plum-ink/60">
              Opening with <strong>{formatPeso(pesosToCentavos(preview))}</strong> in the
              drawer.
            </p>
          )}

          <button
            disabled={pending}
            className="w-full rounded-full py-3 text-base font-semibold btn-brand disabled:opacity-60"
          >
            {pending ? "Opening…" : "Open shift"}
          </button>
          {state?.error && <p className="text-sm font-semibold text-guava">{state.error}</p>}
        </form>

        <div className="mt-5 border-t border-plum-ink/10 pt-4">
          <p className="text-xs text-plum-ink/45">
            Not your till? Sign out and let the right cashier open it — the shift is
            what puts the takings under a name.
          </p>
          <form action={signOut} className="mt-2">
            <button className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold text-plum-ink/70 hover:bg-cream">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
