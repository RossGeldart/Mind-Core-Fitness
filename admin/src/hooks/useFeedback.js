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

  /**
   * Heartbeat "lub-dub" — two low thumps close together.
   * First beat (lub) is deeper, second (dub) is slightly higher + softer.
   * Each beat vibrates the device.
   */
  const tick = useCallback(() => {
    // Vibrate: two quick pulses with a short gap = lub-dub
    if (navigator.vibrate) navigator.vibrate([40, 60, 30]);
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Lub — deep thump at 50Hz
    const osc1 = ctx.createOscillator();
    const vol1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 50;
    vol1.gain.value = 0.25;
    vol1.gain.setTargetAtTime(0, t + 0.06, 0.03);
    osc1.connect(vol1).connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.15);

    // Dub — slightly higher at 70Hz, offset by 120ms
    const osc2 = ctx.createOscillator();
    const vol2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 70;
    vol2.gain.value = 0.18;
    vol2.gain.setTargetAtTime(0, t + 0.18, 0.03);
    osc2.connect(vol2).connect(ctx.destination);
    osc2.start(t + 0.12);
    osc2.stop(t + 0.28);
  }, [getCtx]);

  /** Tap feedback — single low thump on initial press */
  const tap = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(30);
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 55;
    vol.gain.value = 0.3;
    vol.gain.setTargetAtTime(0, t + 0.06, 0.03);
    osc.connect(vol).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
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
