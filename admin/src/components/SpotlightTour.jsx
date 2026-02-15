import { useState, useEffect, useCallback, useRef } from 'react';
import './SpotlightTour.css';

/**
 * Spotlight-overlay guided tour.
 *
 * Props
 *  steps     – array of { selector, title, body, cta? }
 *  onFinish  – called when the user completes or skips the tour
 *  active    – boolean controlling whether the tour renders
 */
export default function SpotlightTour({ steps, onFinish, active }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState('below');
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(null);

  // Filter to only steps whose target element exists in the DOM right now
  const liveSteps = steps.filter(s => document.querySelector(s.selector));
  const step = liveSteps[idx];
  const isLast = idx === liveSteps.length - 1;

  // Measure the target element and decide tooltip placement
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) { setRect(null); return; }

    const r = el.getBoundingClientRect();
    const pad = 8;
    setRect({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });

    const spaceBelow = window.innerHeight - r.bottom;
    setTooltipPos(spaceBelow < 260 ? 'above' : 'below');
    setVisible(true);
  }, [step]);

  // Scroll target into view + measure on step change
  useEffect(() => {
    if (!active || !step) return;

    // Reset visibility while we scroll + remeasure
    setVisible(false);

    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait for scroll to settle, then measure
      const t = setTimeout(measure, 400);
      return () => clearTimeout(t);
    }
  }, [active, idx, step, measure]);

  // Re-measure on scroll / resize so the spotlight tracks the element
  useEffect(() => {
    if (!active) return;
    const onUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onUpdate, true);
    window.addEventListener('resize', onUpdate);
    return () => {
      window.removeEventListener('scroll', onUpdate, true);
      window.removeEventListener('resize', onUpdate);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, measure]);

  if (!active || !step || liveSteps.length === 0) return null;

  const advance = () => {
    if (isLast) { onFinish(); }
    else { setIdx(idx + 1); }
  };

  const back = () => { if (idx > 0) setIdx(idx - 1); };

  const skip = () => onFinish();

  return (
    <div className="st-overlay" onClick={(e) => { e.stopPropagation(); }}>
      {/* Dark backdrop — click anywhere to advance */}
      <div className="st-backdrop" onClick={advance} />

      {/* Cutout spotlight */}
      {rect && visible && (
        <div
          className="st-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      {/* Tooltip */}
      {rect && visible && (
        <div
          className={`st-tooltip st-tooltip-${tooltipPos}`}
          style={{
            top: tooltipPos === 'below' ? rect.top + rect.height + 16 : undefined,
            bottom: tooltipPos === 'above' ? window.innerHeight - rect.top + 16 : undefined,
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 320)),
          }}
        >
          {/* Progress dots */}
          <div className="st-dots">
            {liveSteps.map((_, i) => (
              <span key={i} className={`st-dot${i === idx ? ' active' : ''}${i < idx ? ' done' : ''}`} />
            ))}
          </div>

          <h3 className="st-title">{step.title}</h3>
          <p className="st-body">{step.body}</p>

          <div className="st-actions">
            {idx > 0 && (
              <button className="st-btn st-btn-back" onClick={back}>Back</button>
            )}
            <button className="st-btn st-btn-next" onClick={advance}>
              {step.cta || (isLast ? "Let's Go!" : 'Next')}
            </button>
          </div>

          <button className="st-skip" onClick={skip}>Skip tour</button>
        </div>
      )}
    </div>
  );
}
