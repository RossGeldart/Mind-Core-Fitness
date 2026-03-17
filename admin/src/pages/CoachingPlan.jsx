import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { generateCoachingPlan, getCachedCoachingPlan } from '../services/coachingService';
import './CoachingPlan.css';

function todayString() {
  return new Date().toISOString().split('T')[0];
}

const BLOCK_ICONS = {
  '6am': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  '10am': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
  '2pm': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>,
  '6pm': <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
};

function getBlockIcon(timeRange) {
  if (!timeRange) return null;
  const lower = timeRange.toLowerCase();
  if (lower.includes('6am') || lower.includes('6 am')) return BLOCK_ICONS['6am'];
  if (lower.includes('10am') || lower.includes('10 am')) return BLOCK_ICONS['10am'];
  if (lower.includes('2pm') || lower.includes('2 pm')) return BLOCK_ICONS['2pm'];
  if (lower.includes('6pm') || lower.includes('6 pm')) return BLOCK_ICONS['6pm'];
  return BLOCK_ICONS['10am'];
}

export default function CoachingPlan() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const clientId = clientData?.id;

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [checkIn, setCheckIn] = useState(null);

  const today = todayString();

  useEffect(() => {
    if (!clientId) return;
    loadPlan();
    loadContext();
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadContext() {
    const [healthSnap, checkInSnap] = await Promise.all([
      getDoc(doc(db, 'healthData', `${clientId}_${today}`)),
      getDoc(doc(db, 'dailyCheckIns', `${clientId}_${today}`)),
    ]);
    if (healthSnap.exists()) setHealthData(healthSnap.data());
    if (checkInSnap.exists()) setCheckIn(checkInSnap.data());
  }

  async function loadPlan() {
    setLoading(true);
    try {
      const cached = await getCachedCoachingPlan(clientId, today);
      if (cached) {
        setPlan(cached);
      }
    } catch (err) {
      console.warn('Failed to load cached plan:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateCoachingPlan(today);
      setPlan(result);
    } catch (err) {
      console.error('Failed to generate plan:', err);
      setError('Failed to generate your coaching plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="cp-page">
      <div className="cp-main">
        <div className="cp-header">
          <button className="cp-back" onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1>Today's Plan</h1>
        </div>

        {/* Quick stats bar */}
        {(checkIn || healthData) && (
          <div className="cp-stats-bar">
            {checkIn?.recoveryScore && (
              <div className="cp-stat-chip">
                <span className="cp-stat-label">Recovery</span>
                <span className="cp-stat-val">{checkIn.recoveryScore}/100</span>
              </div>
            )}
            {healthData?.steps > 0 && (
              <div className="cp-stat-chip">
                <span className="cp-stat-label">Steps</span>
                <span className="cp-stat-val">{healthData.steps.toLocaleString()}</span>
              </div>
            )}
            {healthData?.activeCalories > 0 && (
              <div className="cp-stat-chip">
                <span className="cp-stat-label">Burned</span>
                <span className="cp-stat-val">{healthData.activeCalories} cal</span>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="cp-loading">
            <div className="cp-spinner" />
            <p>Loading your plan...</p>
          </div>
        ) : plan ? (
          <div className="cp-plan">
            {/* Morning overview */}
            <div className="cp-overview-card">
              <p className="cp-overview-text">{plan.morningPlan}</p>
            </div>

            {/* Training advice */}
            {plan.trainingAdvice && (
              <div className={`cp-training-card cp-train-${plan.trainingAdvice.shouldTrain ? 'yes' : 'rest'}`}>
                <div className="cp-training-header">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M1 9h2v6H1V9zm3-2h2v10H4V7zm3 4h10v2H7v-2zm10-4h2v10h-2V7zm3 2h2v6h-2V9z"/></svg>
                  <span>{plan.trainingAdvice.shouldTrain ? `Train Today — ${plan.trainingAdvice.intensity}` : 'Rest Day'}</span>
                </div>
                <p>{plan.trainingAdvice.suggestion}</p>
              </div>
            )}

            {/* Adjusted macros */}
            {plan.adjustedMacros && (
              <div className="cp-macros-card">
                <h3>Today's Targets</h3>
                <div className="cp-macros-grid">
                  <div className="cp-macro">
                    <span className="cp-macro-val">{plan.adjustedMacros.calories}</span>
                    <span className="cp-macro-label">Calories</span>
                  </div>
                  <div className="cp-macro">
                    <span className="cp-macro-val">{plan.adjustedMacros.protein}g</span>
                    <span className="cp-macro-label">Protein</span>
                  </div>
                  <div className="cp-macro">
                    <span className="cp-macro-val">{plan.adjustedMacros.carbs}g</span>
                    <span className="cp-macro-label">Carbs</span>
                  </div>
                  <div className="cp-macro">
                    <span className="cp-macro-val">{plan.adjustedMacros.fats}g</span>
                    <span className="cp-macro-label">Fats</span>
                  </div>
                </div>
                {plan.adjustedMacros.reasoning && (
                  <p className="cp-macros-reason">{plan.adjustedMacros.reasoning}</p>
                )}
              </div>
            )}

            {/* 4-hour coaching blocks */}
            <h2 className="cp-blocks-title">Your Day</h2>
            <div className="cp-blocks">
              {(plan.blocks || []).map((block, i) => (
                <div className="cp-block-card" key={i}>
                  <div className="cp-block-header">
                    <span className="cp-block-icon">{getBlockIcon(block.timeRange)}</span>
                    <div>
                      <span className="cp-block-time">{block.timeRange}</span>
                      <span className="cp-block-focus">{block.focus}</span>
                    </div>
                  </div>
                  <p className="cp-block-advice">{block.advice}</p>
                  {block.nutritionTip && (
                    <p className="cp-block-nutrition">{block.nutritionTip}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Key insights */}
            {plan.keyInsights?.length > 0 && (
              <div className="cp-insights-card">
                <h3>Insights</h3>
                {plan.keyInsights.map((insight, i) => (
                  <p key={i} className="cp-insight">{insight}</p>
                ))}
              </div>
            )}

            <button className="cp-regen-btn" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Regenerating...' : 'Regenerate Plan'}
            </button>
          </div>
        ) : (
          <div className="cp-empty">
            <div className="cp-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h2>No Plan Yet</h2>
            <p>Complete your morning check-in first, then generate your personalised coaching plan for today.</p>
            {error && <p className="cp-error">{error}</p>}
            <div className="cp-empty-actions">
              <button className="cp-btn-primary" onClick={() => navigate('/client/core-buddy/check-in')}>
                Do Check-In First
              </button>
              <button className="cp-btn-secondary" onClick={handleGenerate} disabled={generating}>
                {generating ? 'Generating...' : 'Generate Plan Anyway'}
              </button>
            </div>
          </div>
        )}
      </div>
      <CoreBuddyNav active="home" />
    </div>
  );
}
