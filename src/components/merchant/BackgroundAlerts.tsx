"use client";

import { useCallback, useEffect, useState } from "react";
import { sendTestAlert } from "@/server/push/actions";
import { currentEndpoint, enableBackgroundPush, getPushStatus, type PushStatus } from "./push-client";

/**
 * Whether this phone will ring for new orders while the app is minimized, in
 * plain words, with the fix for whichever reason it won't. The in-app alarm
 * only sounds while the screen is open; this is what covers everything else.
 */
export function BackgroundAlerts() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void getPushStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    // Coming back from the phone's settings is the usual way a block is lifted.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  async function turnOn() {
    setBusy(true);
    setStatus(await enableBackgroundPush());
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setTestMsg("Minimize the app now — a test alert arrives in about 8 seconds.");
    const endpoint = await currentEndpoint();
    const r = endpoint ? await sendTestAlert(endpoint) : { ok: false, error: "Turn on alerts first." };
    setTestMsg(r.ok ? "✓ Test alert sent. Didn't hear it? See the tips below." : r.error ?? "The test failed.");
    setBusy(false);
  }

  if (!status || status === "not-configured") return null;

  if (status === "on") {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-green-200 bg-green-50 px-3 py-2 text-sm">
          <span className="font-semibold text-green-700">🔔 Alerts on for this phone — even when minimized</span>
          <button
            type="button"
            disabled={busy}
            onClick={test}
            className="rounded-full border border-green-600 px-3 py-1 text-xs font-semibold text-green-700 disabled:opacity-50"
          >
            Test alert
          </button>
        </div>
        {testMsg && (
          <div className="mt-1 rounded-tile bg-white px-3 py-2 text-xs text-plum-ink/70">
            <p className="font-semibold">{testMsg}</p>
            <SoundTips />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-3">
      <div className="rounded-tile border border-red-300 bg-red-50 p-3 text-sm text-plum-ink">
        <p className="font-bold text-red-700">⚠️ This phone won&apos;t alert you when the app is minimized</p>
        {status === "off" && (
          <>
            <p className="mt-1 text-plum-ink/70">
              New orders only ring while this screen is open. Turn on alerts and tap <strong>Allow</strong> when asked.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={turnOn}
              className="mt-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Turning on…" : "🔔 Turn on alerts"}
            </button>
          </>
        )}
        {status === "denied" && (
          <p className="mt-1 text-plum-ink/70">
            Notifications are blocked for this site. Tap the 🔒 or ⓘ next to the address bar → <strong>Permissions</strong> →{" "}
            <strong>Notifications → Allow</strong>, then come back here. (In the installed app: phone Settings → Apps →
            this app → Notifications → On.)
          </p>
        )}
        {status === "ios-browser" && (
          <p className="mt-1 text-plum-ink/70">
            On iPhone, alerts only work from the installed app. In Safari tap <strong>Share</strong> →{" "}
            <strong>Add to Home Screen</strong>, open Servd from the new icon, sign in, and tap Turn on alerts there.
          </p>
        )}
        {status === "unsupported" && (
          <p className="mt-1 text-plum-ink/70">
            This browser can&apos;t alert in the background. Use <strong>Chrome</strong> on Android, or on iPhone add Servd to
            the Home Screen from Safari.
          </p>
        )}
      </div>
    </div>
  );
}

function SoundTips() {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4">
      <li>Phone not on silent or Do Not Disturb.</li>
      <li>
        Android: Settings → Apps → Chrome (or the installed Servd app) → Notifications → make sure they&apos;re on, with
        <strong> sound</strong>.
      </li>
      <li>Android: Settings → Battery → Chrome → <strong>Unrestricted</strong>, so the phone doesn&apos;t silence it to save battery.</li>
    </ul>
  );
}
