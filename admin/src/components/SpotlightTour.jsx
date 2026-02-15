import { useState, useEffect, useCallback, useRef } from 'react';
import './SpotlightTour.css';

/**
 * Spotlight‑overlay guided tour.
 *
 * Props
 *  steps     – array of { selector, title, body, cta? }
 *  onFinish  – called when the user completes or skips the tour
 *  active    – boolean controlling whether the tour renders
 */
export default function SpotlightTour({ steps, onFinish, active }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState('below'); // 'above' | 'below'
  const tooltipRef = useRef(null);
  const rafRef = useRef(null);

  const step = steps[idx];
  const isLast = idx === steps.length - 1;

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

    // Position tooltip above if target is in lower half, below otherwise
    const spaceBelow = window.innerHeight - r.bottom;
    setTooltipPos(spaceBelow < 260 ? 'above' : 'below');
  }, [step]);

  // Scroll target into view + measure on step change
  useEffect(() => {
    if (!active || !step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Allow scroll to settle before measuring
      const t = setTimeout(measure, 350);
      return () => clearTimeout(t);
    }
  }, [active, idx, step, measure]);

  // Re‑measure on scroll / resize
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

  if (!active || !step) return null;

  const advance = () => {
    if (isLast) { onFinish(); }
    else { setIdx(idx + 1); }
  };

  const back = () => { if (idx > 0) setIdx(idx - 1); };

  const skip = () => onFinish();

  // Spotlight overlay rendered as a positioned box with massive box‑shadow
  return (
    <div className="st-overlay">
      {/* Cutout spotlight */}
      {rect && (
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
      {rect && (
        <div
          ref={tooltipRef}
          className={`st-tooltip st-tooltip-${tooltipPos}`}
          style={{
            top: tooltipPos === 'below' ? rect.top + rect.height + 16 : undefined,
            bottom: tooltipPos === 'above' ? window.innerHeight - rect.top + 16 : undefined,
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 320)),
          }}
        >
          {/* Progress dots */}
          <div className="st-dots">
            {steps.map((_, i) => (
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
              {step.cta || (isLast ? 'Finish' : 'Next')}
            </button>
          </div>

          <button className="st-skip" onClick={skip}>Skip tour</button>
        </div>
      )}
    </div>
  );
}
