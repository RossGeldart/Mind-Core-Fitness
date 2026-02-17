import { useRef, useCallback, useEffect } from 'react';

/**
 * Haptic + audio feedback hook for interactive moments.
 *
 * vibrate() is Android/Chrome only — iOS Safari silently ignores it.
 * AudioContext is gated behind a user gesture, so we resume on first call.
 */
export default function useFeedback() {
  const ctxRef = useRef(null);

  // Lazily create AudioContext (must be after user gesture)
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      } catch { /* no audio support */ }
    }
    const ctx = ctxRef.current;
    if (ctx?.state === 'suspended') ctx.resume();
    return ctx;
  }, []);

  /** Clock tick — short percussive click like a clock hand advancing */
  const tick = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(8);
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Sharp attack oscillator at ~800Hz, dies in ~30ms = clock tick
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 800;
    osc.frequency.setTargetAtTime(400, t + 0.005, 0.005); // quick pitch drop
    vol.gain.value = 0.12;
    vol.gain.setTargetAtTime(0, t + 0.008, 0.006); // very fast decay
    osc.connect(vol).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.035);
  }, [getCtx]);

  /** Tap feedback — slightly louder tick on initial press */
  const tap = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(15);
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 900;
    osc.frequency.setTargetAtTime(450, t + 0.005, 0.005);
    vol.gain.value = 0.18;
    vol.gain.setTargetAtTime(0, t + 0.01, 0.008);
    osc.connect(vol).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }, [getCtx]);

  /** Completion — strong double-pulse vibration + rising chime */
  const complete = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate([50, 80, 100]);
    const ctx = getCtx();
    if (!ctx) return;
    // Two-tone rising chime
    [0, 0.12].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 523 : 784; // C5 → G5
      vol.gain.value = 0.12;
      vol.gain.setTargetAtTime(0, ctx.currentTime + delay + 0.15, 0.02);
      osc.connect(vol).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  }, [getCtx]);

  // Cleanup
  useEffect(() => {
    return () => {
      ctxRef.current?.close();
    };
  }, []);

  return { tap, tick, complete };
}
