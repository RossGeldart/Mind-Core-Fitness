import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  const [transitioning, setTransitioning] = useState(false);
  const rafRef = useRef(null);

  // Reset step index when tour closes so it starts fresh next time
  useEffect(() => {
    if (!active) setIdx(0);
  }, [active]);

  // Build stable list of live steps once when tour activates
  const liveSteps = useMemo(() => {
    if (!active) return [];
    return steps.filter(s => document.querySelector(s.selector));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const step = liveSteps[idx];
  const isLast = idx === liveSteps.length - 1;
  const selector = step?.selector;

  // Measure the target element and decide tooltip placement
  const measure = useCallback(() => {
    if (!selector) return;
    const el = document.querySelector(selector);
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
  }, [selector]);

  // Scroll target into view + measure on step change
  useEffect(() => {
    if (!active || !selector) return;

    // Brief fade-out while spotlight moves to the new target
    setTransitioning(true);

    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait for scroll to settle, then measure + fade back in
      const t = setTimeout(() => {
        measure();
        setTransitioning(false);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [active, idx, selector, measure]);

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
      {/* Transparent click-target — fills screen, click advances */}
      <div className="st-backdrop" onClick={advance} />

      {/* Spotlight cutout — its box-shadow IS the dark overlay */}
      {rect && (
        <div
          className={`st-spotlight${transitioning ? ' st-transitioning' : ''}`}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}

      {/* Tooltip */}
      {rect && (
        <div
          className={`st-tooltip st-tooltip-${tooltipPos}${transitioning ? ' st-transitioning' : ''}`}
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
