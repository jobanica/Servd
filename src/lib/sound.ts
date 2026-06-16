/**
 * Tiny attention beep using the Web Audio API — no audio asset needed. Used to
 * alert the cashier (incoming order / online payment) and the diner (order
 * ready). Best-effort: silently no-ops if audio is blocked or unavailable.
 */
export function beep(durationMs = 220, frequency = 880): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* ignore — sound is a nicety, never required */
  }
}

/** Two quick beeps — a more noticeable "new thing happened" chime. */
export function chime(): void {
  beep(180, 880);
  setTimeout(() => beep(220, 1175), 200);
}
