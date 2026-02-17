import { useState, useRef, useCallback } from 'react';
import generateShareImage from '../utils/generateShareImage';
import useFeedback from '../hooks/useFeedback';
import './WorkoutCelebration.css';

const HOLD_DURATION = 2000;
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const TICK_INTERVAL = 1200; // ms between heartbeats during hold (~50bpm)

const QUOTES = [
  'Another one in the bank!',
  'Consistency beats everything.',
  "You showed up — that's what counts.",
  'Stronger every session.',
];

export default function WorkoutCelebration({ title, subtitle, stats, onDone, onDismissStart, onShareJourney, userName, buttonLabel = 'Done', holdLabel = 'Hold To Complete Session', shareType = 'workout' }) {
  const [phase, setPhase] = useState('hold');       // 'hold' | 'celebrate'
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0-1 for logo reveal
  const [dismissing, setDismissing] = useState(false);
  const [journeyPosted, setJourneyPosted] = useState(false);
  const [shareToast, setShareToast] = useState(null);

  const feedback = useFeedback();
  const ringRef = useRef(null);
  const logoRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const activeRef = useRef(false);
  const holdDoneRef = useRef(false);
  const lastTickRef = useRef(0);
  const quoteRef = useRef(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  const confetti = useRef(
    [...Array(80)].map((_, i) => ({
      x: 5 + Math.random() * 90,
      delay: Math.random() * 3.5,
      color: ['#A12F3A', '#ffffff', '#000000'][i % 3],
      drift: (Math.random() - 0.5) * 120,
      spin: Math.random() * 720 - 360,
      duration: 1.8 + Math.random() * 2,
      width: 4 + Math.random() * 6,
      height: 4 + Math.random() * 8,
      shape: i % 3,
    }))
  );

  const startHold = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    holdDoneRef.current = false;
    lastTickRef.current = 0;
    setHolding(true);
    setHoldProgress(0);
    startRef.current = performance.now();
    feedback.tap();
    if (ringRef.current) ringRef.current.style.strokeDashoffset = RING_CIRCUMFERENCE;

    const animate = (now) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);

      // Update ring
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = RING_CIRCUMFERENCE - progress * RING_CIRCUMFERENCE;
      }
      // Update logo blur/grayscale reveal + scale up
      if (logoRef.current) {
        const blur = 8 * (1 - progress);
        const gray = 1 - progress;
        const scale = 1 + progress * 0.15; // 1.0 → 1.15
        logoRef.current.style.filter = `blur(${blur}px) grayscale(${gray})`;
        logoRef.current.style.transform = `scale(${scale})`;
      }
      setHoldProgress(progress);

      // Tick feedback at intervals
      if (elapsed - lastTickRef.current >= TICK_INTERVAL) {
        lastTickRef.current = elapsed;
        feedback.tick();
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        activeRef.current = false;
        holdDoneRef.current = true;
        rafRef.current = null;
        setHolding(false);
        setHoldProgress(1);
        feedback.complete();
        setPhase('celebrate');
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, [feedback]);

  const cancelHold = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (ringRef.current) ringRef.current.style.strokeDashoffset = RING_CIRCUMFERENCE;
    if (logoRef.current) {
      logoRef.current.style.filter = '';
      logoRef.current.style.transform = '';
    }
    setHolding(false);
    setHoldProgress(0);
  }, []);

  const dismiss = useCallback(() => {
    setDismissing(true);
    onDismissStart?.();
    setTimeout(() => {
      onDone?.();
    }, 300);
  }, [onDone, onDismissStart]);

  const buildShareText = useCallback(() => {
    const parts = [title || 'Workout Complete!'];
    if (subtitle) parts.push(subtitle);
    if (stats?.length) parts.push(stats.map(s => `${s.value} ${s.label}`).join(' | '));
    parts.push('#MindCoreFitness');
    return parts.join('\n');
  }, [title, subtitle, stats]);

  const handleShareJourney = useCallback(async () => {
    if (journeyPosted || !onShareJourney) return;
    try {
      await onShareJourney({
        type: shareType === 'habits' ? 'habits_summary' : 'workout_summary',
        title: title || 'Workout Complete!',
        subtitle,
        stats: stats || [],
        quote: quoteRef.current,
      });
      setJourneyPosted(true);
      setShareToast('Posted to Journey!');
      setTimeout(() => setShareToast(null), 2500);
    } catch (err) {
      console.error('Journey post failed:', err);
      setShareToast(err?.message || 'Failed to post');
      setTimeout(() => setShareToast(null), 3500);
    }
  }, [journeyPosted, onShareJourney, title, subtitle, stats]);

  const [sharing, setSharing] = useState(false);
  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      const blob = await generateShareImage({
        type: shareType || 'workout',
        title: title || 'Workout Complete!',
        subtitle,
        stats: stats || [],
        quote: quoteRef.current,
        userName,
      });
      const text = buildShareText();
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'workout.png', { type: 'image/png' })] })) {
        const file = new File([blob], 'workout.png', { type: 'image/png' });
        await navigator.share({ title: 'Mind Core Fitness', text, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: 'Mind Core Fitness', text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareToast('Copied to clipboard!');
        setTimeout(() => setShareToast(null), 2500);
      }
    } catch {
      // user cancelled or error — fallback to text copy
      try {
        await navigator.clipboard.writeText(buildShareText());
        setShareToast('Copied to clipboard!');
        setTimeout(() => setShareToast(null), 2500);
      } catch { /* ignore */ }
    } finally {
      setSharing(false);
    }
  }, [title, subtitle, stats, userName, buildShareText]);

  // ─── Hold-to-Finish screen ───
  if (phase === 'hold') {
    return (
      <div className="wc-hold-page">
        {/* Radial glow backdrop */}
        <div className="wc-hold-glow" aria-hidden="true" />

        <p className="wc-hold-label">{holdLabel}</p>

        <div
          className={`wc-hold-ring-touch ${holding ? 'wc-holding' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); startHold(); }}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onClick={(e) => { e.stopPropagation(); if (holdDoneRef.current) { holdDoneRef.current = false; } }}
          role="button"
          tabIndex={0}
          aria-label="Press and hold to finish workout"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); feedback.complete(); setPhase('celebrate'); } }}
        >
          {/* Pulsing glow behind ring */}
          <div className="wc-hold-ring-glow" aria-hidden="true" />
          <svg className="wc-hold-ring-svg" viewBox="0 0 100 100">
            <circle className="wc-hold-ring-track" cx="50" cy="50" r={RING_RADIUS} />
            <circle
              className="wc-hold-ring-fill"
              ref={ringRef}
              cx="50" cy="50" r={RING_RADIUS}
              style={{
                strokeDasharray: RING_CIRCUMFERENCE,
                strokeDashoffset: RING_CIRCUMFERENCE,
              }}
            />
          </svg>
          {/* Logo that reveals from blurred/grey → sharp/colour */}
          <img
            ref={logoRef}
            src="/Logo.webp"
            alt="Mind Core Fitness"
            className="wc-hold-logo"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  // ─── Celebration overlay ───
  return (
    <div className={`wc-celeb-overlay ${dismissing ? 'wc-celeb-dismissing' : ''}`}>
      {/* Confetti */}
      <div className="wc-celeb-confetti" aria-hidden="true">
        {confetti.current.map((c, i) => (
          <span key={i} className={`wc-celeb-confetti-piece wc-confetti-shape-${c.shape}`} style={{
            '--x': `${c.x}%`,
            '--delay': `${c.delay}s`,
            '--color': c.color,
            '--drift': `${c.drift}px`,
            '--spin': `${c.spin}deg`,
            '--duration': `${c.duration}s`,
            width: `${c.width}px`,
            height: `${c.height}px`,
          }} />
        ))}
      </div>

      <div className="wc-celeb-content">
        {/* Logo */}
        <div className="wc-celeb-logo-frame">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="wc-celeb-logo-img" />
        </div>

        <h2 className="wc-celeb-heading">{title || 'Congratulations!'}</h2>
        {subtitle && <p className="wc-celeb-subtext">{subtitle}</p>}
        <p className="wc-celeb-quote">{quoteRef.current}</p>

        {/* Stats */}
        {stats && stats.length > 0 && (
          <div className="wc-celeb-stats-row">
            {stats.map((s, i) => (
              <div key={i} className="wc-celeb-stat">
                <span className="wc-celeb-stat-val">{s.value}</span>
                <span className="wc-celeb-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Share buttons */}
        <div className="wc-share-row">
          {onShareJourney && (
            <button
              className={`wc-share-btn wc-share-journey ${journeyPosted ? 'wc-share-done' : ''}`}
              onClick={handleShareJourney}
              disabled={journeyPosted}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              {journeyPosted ? 'Posted!' : 'Post to Journey'}
            </button>
          )}
          <button className="wc-share-btn wc-share-external" onClick={handleShare} disabled={sharing}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {sharing ? 'Generating...' : 'Share'}
          </button>
        </div>

        <button className="wc-celeb-btn" onClick={dismiss}>
          {buttonLabel}
        </button>

        {/* Toast */}
        {shareToast && <div className="wc-share-toast">{shareToast}</div>}
      </div>
    </div>
  );
}
