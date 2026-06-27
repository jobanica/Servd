"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A loud, looping incoming-order alarm for the merchant tablet.
 *
 * Browser autoplay rules forbid sound until the user has interacted with the
 * page, so the flow is: the screen shows a "Tap to enable sound" gate → that tap
 * calls unlock() (which resumes the AudioContext) → afterwards start() can ring
 * at any time. The alarm keeps beeping + vibrating until stop() is called
 * (i.e. staff taps Accept or Reject).
 *
 * The sound is synthesised with the Web Audio API (no audio file to ship, and a
 * pure tone cuts through a noisy kitchen). KNOWN LIMITATION: this only rings
 * reliably while the PWA is open and the tablet is awake — hence the wake-lock
 * and the always-on, plugged-in tablet. We do not promise locked/backgrounded
 * ringing for a PWA.
 */
export function useOrderAlarm() {
  const [unlocked, setUnlocked] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringingRef = useRef(false);

  const getCtx = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  /** Call from a user gesture (the "Enable sound" tap) to satisfy autoplay rules. */
  const unlock = useCallback(async () => {
    const ctx = getCtx();
    if (!ctx) {
      setUnlocked(true); // no audio support — still let the UI proceed (vibration only)
      return;
    }
    try {
      await ctx.resume();
      // Play an inaudible blip so the context is firmly "running".
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.05);
    } catch {
      /* ignore */
    }
    setUnlocked(true);
  }, [getCtx]);

  /** One two-tone beep + a vibration pulse. */
  const beep = useCallback(() => {
    const ctx = getCtx();
    if (ctx && ctx.state === "running") {
      const now = ctx.currentTime;
      const tones = [880, 1320];
      tones.forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = freq;
        const t0 = now + i * 0.22;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.21);
      });
    }
    try {
      navigator.vibrate?.([300, 120, 300]);
    } catch {
      /* ignore */
    }
  }, [getCtx]);

  const start = useCallback(() => {
    if (ringingRef.current) return;
    ringingRef.current = true;
    beep();
    loopRef.current = setInterval(beep, 1400);
  }, [beep]);

  const stop = useCallback(() => {
    ringingRef.current = false;
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { unlocked, unlock, start, stop };
}
