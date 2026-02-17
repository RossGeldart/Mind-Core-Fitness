import { useState, useRef, useCallback } from 'react';
import './WorkoutCelebration.css';

const HOLD_DURATION = 700;
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const QUOTES = [
  'Another one in the bank!',
  'Consistency beats everything.',
  "You showed up — that's what counts.",
  'Stronger every session.',
];

export default function WorkoutCelebration({ title, subtitle, stats, onDone, buttonLabel = 'Done' }) {
  const [phase, setPhase] = useState('hold');       // 'hold' | 'celebrate'
  const [holding, setHolding] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const ringRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const activeRef = useRef(false);
  const holdDoneRef = useRef(false);
  const quoteRef = useRef(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  const confetti = useRef(
    [...Array(80)].map((_, i) => ({
      x: 5 + Math.random() * 90,
      delay: Math.random() * 3.5,
      color: ['#A12F3A', '#4caf50', '#ff9800', '#2196f3', '#e91e63', '#ffeb3b', '#FFD700', '#ffffff', '#9c27b0'][i % 9],
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
    setHolding(true);
    startRef.current = performance.now();
    if (ringRef.current) ringRef.current.style.strokeDashoffset = RING_CIRCUMFERENCE;

    const animate = (now) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);
      if (ringRef.current) {
        ringRef.current.style.strokeDashoffset = RING_CIRCUMFERENCE - progress * RING_CIRCUMFERENCE;
      }
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        activeRef.current = false;
        holdDoneRef.current = true;
        rafRef.current = null;
        setHolding(false);
        if (navigator.vibrate) navigator.vibrate(50);
        setPhase('celebrate');
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  const cancelHold = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (ringRef.current) ringRef.current.style.strokeDashoffset = RING_CIRCUMFERENCE;
    setHolding(false);
  }, []);

  const dismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => {
      onDone?.();
    }, 300);
  }, [onDone]);

  // ─── Hold-to-Finish screen ───
  if (phase === 'hold') {
    return (
      <div className="wc-hold-page">
        {/* Radial glow backdrop */}
        <div className="wc-hold-glow" aria-hidden="true" />

        <h2 className="wc-hold-title">You Crushed It!</h2>
        {subtitle && <p className="wc-hold-subtitle">{subtitle}</p>}

        {/* Stats preview */}
        {stats && stats.length > 0 && (
          <div className="wc-hold-stats">
            {stats.map((s, i) => (
              <div key={i} className="wc-hold-stat">
                <span className="wc-hold-stat-val">{s.value}</span>
                <span className="wc-hold-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        <p className="wc-hold-hint">Hold to finish</p>

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
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPhase('celebrate'); } }}
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
          <div className="wc-hold-icon">
            {/* Trophy icon */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2" />
              <path d="M18 9h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2" />
              <path d="M6 3h12v7a6 6 0 0 1-12 0V3z" />
              <path d="M9 21h6" />
              <path d="M12 16v5" />
            </svg>
          </div>
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

        <button className="wc-celeb-btn" onClick={dismiss}>
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
