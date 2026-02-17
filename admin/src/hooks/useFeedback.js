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

  // Play a short sine-wave beep at a given frequency + duration
  const beep = useCallback((freq, duration, gain = 0.08) => {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    vol.gain.value = gain;
    // Quick fade-out to avoid click
    vol.gain.setTargetAtTime(0, ctx.currentTime + duration * 0.8, 0.01);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }, [getCtx]);

  /** Tap feedback — short vibration + quiet tick */
  const tap = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(15);
    beep(600, 0.04, 0.05);
  }, [beep]);

  /** Tick during hold — subtle repeating pulse */
  const tick = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(10);
    beep(440, 0.03, 0.04);
  }, [beep]);

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
