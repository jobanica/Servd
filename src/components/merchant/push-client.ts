"use client";

import { savePushSubscription } from "@/server/push/actions";

/**
 * Whether THIS phone will be alerted about new orders while the merchant app
 * is minimized or closed — and if not, why. Each answer has a different fix,
 * which is the point of telling them apart.
 */
export type PushStatus =
  | "on" // allowed and subscribed
  | "off" // never asked, or subscription missing — one tap fixes it
  | "denied" // blocked in the browser's site settings
  | "ios-browser" // iPhone in Safari: must be added to the Home Screen first
  | "unsupported" // this browser can't do background alerts
  | "not-configured"; // push isn't set up on this deployment

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!VAPID) return "not-configured";
  if (typeof window === "undefined") return "unsupported";
  // iPhones only get web push from an app added to the Home Screen.
  if (isIos() && !isStandalone()) return "ios-browser";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/** This phone's subscription endpoint, for the test alert. */
export async function currentEndpoint(): Promise<string | null> {
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** VAPID key (URL-safe base64) → Uint8Array for pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Subscribe this device to Web Push and store the subscription. Asking for
 * permission needs a tap, so the first call must come from a button. Safe to
 * call on every load once allowed: it refreshes the stored subscription.
 * Returns where things stand afterwards.
 */
export async function enableBackgroundPush(): Promise<PushStatus> {
  const before = await getPushStatus();
  if (before === "not-configured" || before === "unsupported" || before === "ios-browser" || before === "denied") {
    return before;
  }
  try {
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return perm === "denied" ? "denied" : "off";
    }
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID!) as BufferSource,
      }));
    const json = sub.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      const saved = await savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
      if (!saved.ok) return "off";
    }
    return "on";
  } catch {
    return "off";
  }
}
