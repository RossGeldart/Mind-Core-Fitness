import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTier } from '../contexts/TierContext';
import './MetricsHeroCard.css';

const FOCUS_OPTIONS = [
  { key: 'waist', name: 'Waist' },
  { key: 'chest', name: 'Chest' },
  { key: 'hips', name: 'Hips' },
  { key: 'leftArm', name: 'Left Arm' },
  { key: 'rightArm', name: 'Right Arm' },
  { key: 'leftThigh', name: 'Left Thigh' },
  { key: 'rightThigh', name: 'Right Thigh' },
  { key: 'leftCalf', name: 'Left Calf' },
  { key: 'rightCalf', name: 'Right Calf' },
];

const REMEASURE_DAYS = 28;
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function nameFor(key) {
  return FOCUS_OPTIONS.find(o => o.key === key)?.name || key;
}

function daysBetween(a, b) {
  return Math.floor(Math.abs(a - b) / (1000 * 60 * 60 * 24));
}

export default function MetricsHeroCard({ onOpenMetrics }) {
  const { clientData } = useAuth();
  const { isPremium } = useTier();

  const [loading, setLoading] = useState(true);
  const [targetsDoc, setTargetsDoc] = useState(null);
  const [records, setRecords] = useState([]); // sorted desc by period
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);
  const [savingFocus, setSavingFocus] = useState(false);

  const load = useCallback(async () => {
    if (!clientData?.id) return;
    try {
      const targetsSnap = await getDoc(doc(db, 'coreBuddyMetricTargets', clientData.id));
      if (!targetsSnap.exists()) {
        setTargetsDoc(null);
        setLoading(false);
        return;
      }
      setTargetsDoc(targetsSnap.data());

      const metricsSnap = await getDocs(
        query(collection(db, 'coreBuddyMetrics'), where('clientId', '==', clientData.id))
      );
      const recs = metricsSnap.docs
        .map(d => d.data())
        .sort((a, b) => (b.period || '').localeCompare(a.period || ''));
      setRecords(recs);
    } catch (err) {
      console.error('MetricsHeroCard load error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientData]);

  useEffect(() => { load(); }, [load]);

  // Premium gate — free users don't see body metrics at all
  if (!isPremium) return null;
  if (loading) return null;

  // State 1: No setup
  if (!targetsDoc?.setupComplete) {
    return (
      <button type="button" className="mhc-wrap mhc-empty" onClick={onOpenMetrics}>
        <div className="mhc-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20v-6M6 20V10M18 20V4"/>
          </svg>
        </div>
        <div className="mhc-empty-content">
          <h3 className="mhc-empty-title">Body Metrics</h3>
          <p className="mhc-empty-desc">Track progress with a monthly measure-up</p>
        </div>
        <span className="mhc-empty-cta">Set up &rarr;</span>
      </button>
    );
  }

  const focusKey = targetsDoc.focusMetric || 'waist';
  const baseline = targetsDoc.baseline?.[focusKey];
  const target = targetsDoc.targets?.[focusKey];
  const latest = records[0];
  const prior = records[1];
  const current = latest?.measurements?.[focusKey];
  const priorValue = prior?.measurements?.[focusKey];

  // If the focus metric has no data (e.g. legacy doc), fallback
  const hasData = baseline != null && target != null && current != null;

  // Progress %
  let pct = 0;
  if (hasData) {
    const diff = target - baseline;
    pct = diff !== 0 ? Math.max(0, Math.min(Math.round(((current - baseline) / diff) * 100), 100)) : 100;
  }
  const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;

  // Direction
  const goalDir = target > baseline ? 'gain' : target < baseline ? 'lose' : 'hold';

  // Delta since last measurement
  let deltaValue = null;
  let daysSincePrior = null;
  if (priorValue != null && current != null) {
    deltaValue = current - priorValue;
  }
  if (prior?.period && latest?.period) {
    daysSincePrior = daysBetween(new Date(latest.period), new Date(prior.period));
  }

  // Days since last measured (for remeasure prompt)
  const lastMeasured = targetsDoc.lastMeasured?.toDate
    ? targetsDoc.lastMeasured.toDate()
    : targetsDoc.lastMeasured
      ? new Date(targetsDoc.lastMeasured)
      : null;
  const daysSinceLast = lastMeasured ? daysBetween(new Date(), lastMeasured) : null;
  const needsRemeasure = daysSinceLast != null && daysSinceLast >= REMEASURE_DAYS;

  // Delta direction relative to goal
  let deltaClass = 'mhc-delta-neutral';
  let deltaArrow = '→';
  if (deltaValue != null) {
    if (deltaValue === 0) {
      deltaArrow = '→';
      deltaClass = 'mhc-delta-neutral';
    } else {
      const movingTowardGoal =
        (goalDir === 'lose' && deltaValue < 0) ||
        (goalDir === 'gain' && deltaValue > 0) ||
        (goalDir === 'hold' && Math.abs(deltaValue) <= 0.5);
      deltaArrow = deltaValue > 0 ? '↑' : '↓';
      deltaClass = movingTowardGoal ? 'mhc-delta-good' : 'mhc-delta-bad';
    }
  }

  const saveFocus = async (newKey) => {
    if (!clientData?.id || newKey === focusKey || savingFocus) return;
    setSavingFocus(true);
    try {
      await setDoc(
        doc(db, 'coreBuddyMetricTargets', clientData.id),
        { focusMetric: newKey },
        { merge: true }
      );
      setTargetsDoc(prev => ({ ...prev, focusMetric: newKey }));
      setFocusPickerOpen(false);
    } catch (err) {
      console.error('Error saving focus metric:', err);
    } finally {
      setSavingFocus(false);
    }
  };

  return (
    <div className={`mhc-wrap${needsRemeasure ? ' mhc-stale' : ''}`}>
      <div className="mhc-header">
        <span className="mhc-title">Body Metrics</span>
        {daysSinceLast != null && (
          <span className={`mhc-last-measured${needsRemeasure ? ' mhc-last-stale' : ''}`}>
            {daysSinceLast === 0 ? 'Today' : `${daysSinceLast}d ago`}
          </span>
        )}
      </div>

      <div className="mhc-body">
        {/* Hero ring */}
        <div className="mhc-ring-wrap">
          <svg className="mhc-ring" viewBox="0 0 100 100">
            <circle className="mhc-ring-track" cx="50" cy="50" r={RING_RADIUS} />
            <circle
              className="mhc-ring-fill"
              cx="50" cy="50" r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={offset}
            />
          </svg>
          <span className="mhc-ring-pct">{hasData ? `${pct}%` : '—'}</span>
        </div>

        {/* Focus + values + delta */}
        <div className="mhc-info">
          <button
            type="button"
            className="mhc-focus-pill"
            onClick={(e) => { e.stopPropagation(); setFocusPickerOpen(v => !v); }}
            aria-label={`Change focus metric (currently ${nameFor(focusKey)})`}
          >
            {nameFor(focusKey)}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
          </button>

          {hasData ? (
            <div className="mhc-values">
              <span className="mhc-current">{current.toFixed(1)} cm</span>
              <span className="mhc-arrow">&rarr;</span>
              <span className="mhc-target">{target.toFixed(1)} cm</span>
            </div>
          ) : (
            <div className="mhc-values mhc-values-empty">No data for this metric</div>
          )}

          {deltaValue != null && (
            <div className={`mhc-delta ${deltaClass}`}>
              <span className="mhc-delta-arrow">{deltaArrow}</span>
              {Math.abs(deltaValue).toFixed(1)} cm
              {daysSincePrior != null && (
                <span className="mhc-delta-since">· since last measure{daysSincePrior > 0 ? ` · ${daysSincePrior}d` : ''}</span>
              )}
            </div>
          )}

          {!deltaValue && hasData && (
            <div className="mhc-delta mhc-delta-neutral">
              Baseline saved — log again to see progress
            </div>
          )}
        </div>
      </div>

      {needsRemeasure && (
        <div className="mhc-remeasure" onClick={onOpenMetrics} role="button" tabIndex={0}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
          </svg>
          Time for your monthly measure-up
        </div>
      )}

      <button type="button" className="mhc-cta" onClick={onOpenMetrics}>
        View all measurements
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      {/* Focus picker overlay */}
      {focusPickerOpen && (
        <div className="mhc-picker-overlay" onClick={() => setFocusPickerOpen(false)}>
          <div className="mhc-picker" onClick={(e) => e.stopPropagation()}>
            <h4 className="mhc-picker-title">Focus metric</h4>
            <p className="mhc-picker-desc">Which measurement matters most to you?</p>
            <div className="mhc-picker-options">
              {FOCUS_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className={`mhc-picker-option${opt.key === focusKey ? ' mhc-picker-active' : ''}`}
                  onClick={() => saveFocus(opt.key)}
                  disabled={savingFocus}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
