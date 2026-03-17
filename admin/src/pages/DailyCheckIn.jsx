import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { saveCheckIn, getCheckIn } from '../services/coachingService';
import { calculateRecoveryScore } from '../services/coachingService';
import './DailyCheckIn.css';

const isNative = Capacitor.isNativePlatform();

function todayString() {
  return new Date().toISOString().split('T')[0];
}

const ENERGY_LABELS = ['Drained', 'Low', 'Okay', 'Good', 'Fired Up'];
const MOOD_LABELS = ['Rough', 'Meh', 'Alright', 'Good', 'Great'];
const STRESS_LABELS = ['Chill', 'Low', 'Moderate', 'High', 'Maxed'];
const SORENESS_LABELS = ['None', 'Mild', 'Moderate', 'Sore', 'Very Sore'];

export default function DailyCheckIn() {
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const clientId = clientData?.id;

  const [energy, setEnergy] = useState(3);
  const [mood, setMood] = useState(3);
  const [stress, setStress] = useState(2);
  const [soreness, setSoreness] = useState(2);
  const [sleepHours, setSleepHours] = useState(7);
  const [sleepQuality, setSleepQuality] = useState(3);
  const [saving, setSaving] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);
  const [alreadyCheckedIn, setAlreadyCheckedIn] = useState(false);
  const [healthData, setHealthData] = useState(null);
  const [error, setError] = useState(null);

  const today = todayString();

  // Load existing check-in and health data
  useEffect(() => {
    if (!clientId) return;
    (async () => {
      const [existing, healthSnap] = await Promise.all([
        getCheckIn(clientId, today),
        getDoc(doc(db, 'healthData', `${clientId}_${today}`)),
      ]);

      if (existing) {
        setAlreadyCheckedIn(true);
        setEnergy(existing.energy || 3);
        setMood(existing.mood || 3);
        setStress(existing.stress || 2);
        setSoreness(existing.sorenessLevel || 2);
        setSleepHours(existing.sleepHours || 7);
        setSleepQuality(existing.sleepQuality || 3);
        if (existing.recoveryScore) {
          setRecoveryResult({
            score: existing.recoveryScore,
            grade: existing.recoveryGrade,
            recommendation: existing.recoveryRecommendation || '',
          });
        }
      }

      // Pre-fill sleep from health data (watch sync)
      if (healthSnap.exists()) {
        const hd = healthSnap.data();
        setHealthData(hd);
        if (!existing && hd.sleep?.totalHours > 0) {
          setSleepHours(hd.sleep.totalHours);
        }
      }
    })();
  }, [clientId, today]);

  const handleSubmit = async () => {
    if (!clientId || saving) return;
    setSaving(true);
    setError(null);

    try {
      const checkInData = {
        energy,
        mood,
        stress,
        sorenessLevel: soreness,
        sleepHours,
        sleepQuality,
        type: getTimeOfDay(),
      };

      await saveCheckIn(clientId, today, checkInData);

      // Calculate recovery score
      const result = await calculateRecoveryScore({
        sleepHours,
        sleepQuality,
        sorenessLevel: soreness,
      });

      setRecoveryResult(result);
      setAlreadyCheckedIn(true);
    } catch (err) {
      console.error('Check-in failed:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  function getTimeOfDay() {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : 'evening';
  }

  const isMorning = getTimeOfDay() === 'morning';

  // Recovery result screen
  if (recoveryResult) {
    return (
      <div className="dci-page">
        <div className="dci-main">
          <div className="dci-result-card">
            <div className={`dci-score-ring dci-score-${recoveryResult.grade?.toLowerCase().replace(' ', '-')}`}>
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-color)" strokeWidth="8" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${(recoveryResult.score / 100) * 327} 327`}
                  transform="rotate(-90 60 60)" />
              </svg>
              <div className="dci-score-value">{recoveryResult.score}</div>
            </div>
            <h2 className="dci-grade">{recoveryResult.grade}</h2>
            <p className="dci-recommendation">{recoveryResult.recommendation}</p>

            {healthData && (
              <div className="dci-health-summary">
                {healthData.steps > 0 && (
                  <div className="dci-health-stat">
                    <span className="dci-health-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    </span>
                    <span>{healthData.steps.toLocaleString()} steps</span>
                  </div>
                )}
                {healthData.activeCalories > 0 && (
                  <div className="dci-health-stat">
                    <span className="dci-health-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22c-4.97 0-9-2.69-9-6v-2c0-3.31 4.03-6 9-6s9 2.69 9 6v2c0 3.31-4.03 6-9 6z"/></svg>
                    </span>
                    <span>{healthData.activeCalories} active cals</span>
                  </div>
                )}
                {healthData.sleep?.totalHours > 0 && (
                  <div className="dci-health-stat">
                    <span className="dci-health-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    </span>
                    <span>{healthData.sleep.totalHours}h sleep</span>
                  </div>
                )}
              </div>
            )}

            <div className="dci-result-actions">
              <button className="dci-btn-primary" onClick={() => navigate('/client/core-buddy/coaching')}>
                View Today's Plan
              </button>
              <button className="dci-btn-secondary" onClick={() => navigate('/client/core-buddy')}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
        <CoreBuddyNav active="home" />
      </div>
    );
  }

  return (
    <div className="dci-page">
      <div className="dci-main">
        <div className="dci-header">
          <button className="dci-back" onClick={() => navigate(-1)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1>{isMorning ? 'Morning Check-In' : 'Evening Check-In'}</h1>
        </div>

        {healthData?.sleep?.totalHours > 0 && (
          <div className="dci-watch-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Watch data synced: {healthData.sleep.totalHours}h sleep</span>
          </div>
        )}

        <div className="dci-form">
          {/* Sleep */}
          <div className="dci-section">
            <label className="dci-label">Sleep</label>
            <div className="dci-sleep-row">
              <div className="dci-sleep-input">
                <label>Hours</label>
                <div className="dci-stepper">
                  <button onClick={() => setSleepHours(Math.max(0, Math.round((sleepHours - 0.5) * 10) / 10))}>-</button>
                  <span>{sleepHours}h</span>
                  <button onClick={() => setSleepHours(Math.min(14, Math.round((sleepHours + 0.5) * 10) / 10))}>+</button>
                </div>
              </div>
              <div className="dci-sleep-input">
                <label>Quality</label>
                <div className="dci-tap-row">
                  {[1,2,3,4,5].map(v => (
                    <button key={v} className={`dci-tap-btn${sleepQuality === v ? ' active' : ''}`}
                      onClick={() => setSleepQuality(v)}>{v}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Energy */}
          <div className="dci-section">
            <label className="dci-label">Energy <span className="dci-label-value">{ENERGY_LABELS[energy - 1]}</span></label>
            <div className="dci-tap-row">
              {[1,2,3,4,5].map(v => (
                <button key={v} className={`dci-tap-btn dci-tap-lg${energy === v ? ' active' : ''}`}
                  onClick={() => setEnergy(v)}>{v}</button>
              ))}
            </div>
          </div>

          {/* Mood */}
          <div className="dci-section">
            <label className="dci-label">Mood <span className="dci-label-value">{MOOD_LABELS[mood - 1]}</span></label>
            <div className="dci-tap-row">
              {[1,2,3,4,5].map(v => (
                <button key={v} className={`dci-tap-btn dci-tap-lg${mood === v ? ' active' : ''}`}
                  onClick={() => setMood(v)}>{v}</button>
              ))}
            </div>
          </div>

          {/* Stress */}
          <div className="dci-section">
            <label className="dci-label">Stress <span className="dci-label-value">{STRESS_LABELS[stress - 1]}</span></label>
            <div className="dci-tap-row">
              {[1,2,3,4,5].map(v => (
                <button key={v} className={`dci-tap-btn dci-tap-lg${stress === v ? ' active' : ''}`}
                  onClick={() => setStress(v)}>{v}</button>
              ))}
            </div>
          </div>

          {/* Soreness */}
          <div className="dci-section">
            <label className="dci-label">Soreness <span className="dci-label-value">{SORENESS_LABELS[soreness - 1]}</span></label>
            <div className="dci-tap-row">
              {[1,2,3,4,5].map(v => (
                <button key={v} className={`dci-tap-btn dci-tap-lg${soreness === v ? ' active' : ''}`}
                  onClick={() => setSoreness(v)}>{v}</button>
              ))}
            </div>
          </div>

          <button className="dci-submit" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Calculating...' : alreadyCheckedIn ? 'Update Check-In' : 'Get My Recovery Score'}
          </button>

          {error && (
            <div style={{ color: '#ff6b6b', textAlign: 'center', marginTop: '12px', fontSize: '14px' }}>
              {error}
            </div>
          )}
        </div>
      </div>
      <CoreBuddyNav active="home" />
    </div>
  );
}
