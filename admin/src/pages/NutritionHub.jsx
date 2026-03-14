import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './NutritionHub.css';

const BETA_EMAILS = ['testy@test123.com'];

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function getDateKey(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

function getDayLabel(daysAgo) {
  if (daysAgo === 0) return 'Today';
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString('en-GB', { weekday: 'short' }).charAt(0);
}

const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

const MEAL_ICONS = {
  breakfast: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>,
  lunch: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  dinner: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  snacks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
};

export default function NutritionHub() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [targets, setTargets] = useState(null);
  const [todayLog, setTodayLog] = useState(null);
  const [totals, setTotals] = useState({ protein: 0, carbs: 0, fats: 0, calories: 0 });
  const [streak, setStreak] = useState(0);
  const [weekData, setWeekData] = useState([]); // 7 days of calorie data
  const [favourites, setFavourites] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [quickAddToast, setQuickAddToast] = useState(null);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  const isBetaUser = BETA_EMAILS.includes(currentUser?.email?.toLowerCase());

  // Load all hub data in parallel
  useEffect(() => {
    if (!clientData?.id) return;
    const loadData = async () => {
      setDataLoading(true);
      const todayKey = getTodayKey();
      try {
        // Fetch targets, today's log, favourites, and last 7 days in parallel
        const dayKeys = Array.from({ length: 7 }, (_, i) => getDateKey(i));
        const [targetsDoc, todayDoc, favsDoc, ...weekDocs] = await Promise.all([
          getDoc(doc(db, 'nutritionTargets', clientData.id)),
          getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${todayKey}`)),
          getDoc(doc(db, 'favouriteFoods', clientData.id)),
          ...dayKeys.map(k => getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${k}`))),
        ]);

        // Targets
        const t = targetsDoc.exists() ? targetsDoc.data() : null;
        setTargets(t);

        // Today's log
        const todayEntries = todayDoc.exists() ? (todayDoc.data().entries || []) : [];
        setTodayLog(todayEntries);

        // Totals
        const tot = todayEntries.reduce((acc, e) => ({
          protein: acc.protein + (e.protein || 0),
          carbs: acc.carbs + (e.carbs || 0),
          fats: acc.fats + (e.fats || 0),
          calories: acc.calories + (e.calories || 0),
        }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
        setTotals(tot);

        // Favourites
        if (favsDoc.exists()) {
          setFavourites((favsDoc.data().items || []).slice(0, 6));
        }

        // Week data for adherence bars
        const week = dayKeys.map((k, i) => {
          const d = weekDocs[i];
          if (!d.exists()) return { day: getDayLabel(i), calories: 0, logged: false };
          const entries = d.data().entries || [];
          const cal = entries.reduce((sum, e) => sum + (e.calories || 0), 0);
          return { day: getDayLabel(i), calories: cal, logged: entries.length > 0 };
        }).reverse(); // oldest first
        setWeekData(week);

        // Calculate protein streak
        if (t?.protein) {
          let s = 0;
          for (let i = 0; i < 7; i++) {
            const d = weekDocs[i];
            if (!d.exists()) break;
            const dayProtein = (d.data().entries || []).reduce((acc, e) => acc + (e.protein || 0), 0);
            if (dayProtein >= t.protein) { s++; } else { break; }
          }
          setStreak(s);
        }
      } catch (err) {
        console.error('Error loading nutrition hub data:', err);
      } finally {
        setDataLoading(false);
      }
    };
    loadData();
  }, [clientData?.id]);

  // Quick-add a favourite to today's log
  const quickAddFavourite = useCallback(async (fav) => {
    if (!clientData?.id) return;
    const todayKey = getTodayKey();
    const entry = {
      id: Date.now(),
      name: fav.name,
      protein: fav.protein || 0,
      carbs: fav.carbs || 0,
      fats: fav.fats || 0,
      calories: fav.calories || 0,
      serving: fav.serving || '',
      meal: 'snacks',
      addedAt: new Date().toISOString(),
      per100g: fav.per100g || null,
      servingUnit: fav.servingUnit || 'g',
      portion: fav.portion || null,
    };
    const updatedEntries = [...(todayLog || []), entry];
    setTodayLog(updatedEntries);
    const newTotals = updatedEntries.reduce((acc, e) => ({
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fats: acc.fats + (e.fats || 0),
      calories: acc.calories + (e.calories || 0),
    }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
    setTotals(newTotals);
    try {
      await setDoc(doc(db, 'nutritionLogs', `${clientData.id}_${todayKey}`), {
        clientId: clientData.id,
        date: todayKey,
        entries: updatedEntries,
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error('Error quick-adding favourite:', err);
    }
    setQuickAddToast(fav.name);
    setTimeout(() => setQuickAddToast(null), 2500);
  }, [clientData?.id, todayLog]);

  // Macro ring helpers
  const MACRO_COLORS = {
    protein: isDark ? '#2dd4bf' : '#14b8a6',
    carbs: isDark ? '#fbbf24' : '#f59e0b',
    fats: isDark ? '#a78bfa' : '#8b5cf6',
    cals: 'var(--color-primary)',
  };
  const RING_R = 34;
  const RING_C = 2 * Math.PI * RING_R;

  const renderMiniRing = (label, current, target, colorKey) => {
    const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
    const offset = RING_C - (pct / 100) * RING_C;
    const color = MACRO_COLORS[colorKey];
    return (
      <div className="nhub-ring-wrap">
        <svg className="nhub-ring-svg" viewBox="0 0 80 80">
          <circle className="nhub-ring-track" cx="40" cy="40" r={RING_R} />
          <circle className="nhub-ring-fill" cx="40" cy="40" r={RING_R}
            style={{ stroke: color }}
            strokeDasharray={RING_C}
            strokeDashoffset={offset} />
        </svg>
        <div className="nhub-ring-center">
          <span className="nhub-ring-value" style={{ color }}>{Math.round(current)}</span>
          <span className="nhub-ring-unit">{label === 'Cals' ? '' : 'g'}</span>
        </div>
        <span className="nhub-ring-label">{label}</span>
        <span className="nhub-ring-pct" style={{ color }}>{pct}%</span>
      </div>
    );
  };

  // Today's meals grouped
  const mealGroups = MEALS.map(m => {
    const entries = (todayLog || []).filter(e => e.meal === m.key);
    const cal = entries.reduce((s, e) => s + (e.calories || 0), 0);
    return { ...m, entries, cal };
  });

  // Remaining nudge text
  const getNudgeText = () => {
    if (!targets) return null;
    const protLeft = Math.max(0, Math.round(targets.protein - totals.protein));
    const calLeft = Math.max(0, Math.round(targets.calories - totals.calories));
    if (protLeft <= 0 && calLeft <= 0) return "You've hit all your targets today!";
    if (protLeft <= 5 && protLeft > 0) return `Only ${protLeft}g protein to go — you're almost there!`;
    if (protLeft > 0 && calLeft > 0) return `${protLeft}g protein and ${calLeft} cals remaining today`;
    if (protLeft > 0) return `${protLeft}g protein left to hit your target`;
    return `${calLeft} calories remaining today`;
  };

  // Get time-aware greeting
  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (authLoading) {
    return (
      <div className="nut-hub-page">
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          </div>
        </header>
        <div className="nut-hub-loading"><div className="cb-loading-spinner" /></div>
      </div>
    );
  }

  const hasTargets = targets && targets.calories > 0;
  const hasLoggedToday = todayLog && todayLog.length > 0;

  return (
    <div className="nut-hub-page">
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="nut-hub-main">
        {dataLoading ? (
          <div className="nut-hub-loading"><div className="cb-loading-spinner" /></div>
        ) : !hasTargets ? (
          /* No targets set — prompt to set up */
          <div className="nhub-setup-prompt">
            <div className="nhub-setup-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/>
                <path d="M12 8v4M12 16h.01"/>
              </svg>
            </div>
            <h2>Set Your Macro Targets</h2>
            <p>Calculate your daily protein, carbs, fats and calorie targets to start tracking</p>
            <button className="nhub-setup-btn" onClick={() => navigate('/client/core-buddy/nutrition/manual')}>
              Get Started
            </button>
          </div>
        ) : (
          <>
            {/* Greeting + streak */}
            <div className="nhub-top-section">
              <div className="nhub-greeting-row">
                <div className="nhub-greeting">
                  <h2>{getGreeting()}</h2>
                  <p>Here&apos;s your nutrition today</p>
                </div>
                {streak > 0 && (
                  <div className="nhub-streak">
                    <div className="nhub-streak-flame">
                      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <path d="M12 23c-3.866 0-7-3.134-7-7 0-3.527 3.397-6.67 5-9.338C11.602 9.33 19 12.473 19 16c0 3.866-3.134 7-7 7zm0-2c2.761 0 5-2.239 5-5 0-1.94-2.476-4.178-5-6.71C9.476 11.822 7 14.06 7 16c0 2.761 2.239 5 5 5z"/>
                      </svg>
                    </div>
                    <span className="nhub-streak-count">{streak}</span>
                    <span className="nhub-streak-label">day{streak !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              {/* Macro rings */}
              <div className="nhub-rings-row">
                {renderMiniRing('Protein', totals.protein, targets.protein, 'protein')}
                {renderMiniRing('Carbs', totals.carbs, targets.carbs, 'carbs')}
                {renderMiniRing('Fats', totals.fats, targets.fats, 'fats')}
                {renderMiniRing('Cals', totals.calories, targets.calories, 'cals')}
              </div>

              {/* Remaining nudge */}
              {getNudgeText() && (
                <div className={`nhub-nudge ${totals.protein >= (targets.protein || 0) && totals.calories >= (targets.calories || 0) ? 'nhub-nudge--complete' : ''}`}>
                  {totals.protein >= (targets.protein || 0) && totals.calories >= (targets.calories || 0) ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                  )}
                  <span>{getNudgeText()}</span>
                </div>
              )}
            </div>

            {/* Quick-add favourites */}
            {favourites.length > 0 && (
              <div className="nhub-favs-section">
                <div className="nhub-section-header">
                  <span className="nhub-section-title">Quick Add</span>
                  <span className="nhub-section-subtitle">Tap to log</span>
                </div>
                <div className="nhub-favs-scroll">
                  {favourites.map((fav, i) => (
                    <button key={i} className="nhub-fav-chip" onClick={() => quickAddFavourite(fav)}>
                      <span className="nhub-fav-name">{fav.name}</span>
                      <span className="nhub-fav-cal">{Math.round(fav.calories)} cal</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Today's meals summary */}
            <div className="nhub-meals-section">
              <div className="nhub-section-header">
                <span className="nhub-section-title">Today&apos;s Meals</span>
              </div>
              <div className="nhub-meals-grid">
                {mealGroups.map(m => (
                  <button key={m.key} className={`nhub-meal-card ${m.entries.length > 0 ? 'nhub-meal-card--filled' : ''}`}
                    onClick={() => navigate('/client/core-buddy/nutrition/manual')}
                  >
                    <div className="nhub-meal-icon">{MEAL_ICONS[m.key]}</div>
                    <span className="nhub-meal-label">{m.label}</span>
                    {m.entries.length > 0 ? (
                      <span className="nhub-meal-cal">{Math.round(m.cal)} cal</span>
                    ) : (
                      <span className="nhub-meal-empty">+ Add</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Weekly adherence */}
            <div className="nhub-week-section">
              <div className="nhub-section-header">
                <span className="nhub-section-title">This Week</span>
              </div>
              <div className="nhub-week-bars">
                {weekData.map((d, i) => {
                  const pct = targets?.calories > 0 ? Math.min(100, Math.round((d.calories / targets.calories) * 100)) : 0;
                  const isToday = i === weekData.length - 1;
                  let barClass = 'nhub-bar-empty';
                  if (d.logged && pct >= 80) barClass = 'nhub-bar-good';
                  else if (d.logged && pct >= 50) barClass = 'nhub-bar-mid';
                  else if (d.logged) barClass = 'nhub-bar-low';
                  return (
                    <div key={i} className={`nhub-bar-col ${isToday ? 'nhub-bar-today' : ''}`}>
                      <div className="nhub-bar-track">
                        <div className={`nhub-bar-fill ${barClass}`} style={{ height: `${Math.max(d.logged ? 8 : 0, pct)}%` }} />
                      </div>
                      <span className="nhub-bar-day">{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action cards */}
            <div className="nhub-actions-section">
              <button className="nut-hub-card" onClick={() => navigate('/client/core-buddy/nutrition/manual')}>
                <div className="nut-hub-card-icon nut-hub-card-icon--manual">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </div>
                <div className="nut-hub-card-body">
                  <h3>Log a Meal</h3>
                  <p>Search foods, scan barcodes or enter manually</p>
                </div>
                <svg className="nut-hub-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>

              <div className={`nut-hub-card nut-hub-card--ai${!isBetaUser ? ' nut-hub-card--locked' : ''}`}
                onClick={() => { if (isBetaUser) navigate('/client/core-buddy/nutrition/ai-scanner'); }}
                role={isBetaUser ? 'button' : undefined}
                tabIndex={isBetaUser ? 0 : undefined}
              >
                <div className="nut-hub-card-icon nut-hub-card-icon--ai">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
                <div className="nut-hub-card-body">
                  <div className="nut-hub-card-title-row">
                    <h3>AI Food Scanner</h3>
                    <span className="nut-hub-badge nut-hub-badge--beta">BETA</span>
                  </div>
                  <p>Upload photos of your meals for automatic macro analysis</p>
                  {!isBetaUser && <span className="nut-hub-coming-soon">Coming Soon</span>}
                  {isBetaUser && <span className="nut-hub-beta-access">You have early access</span>}
                </div>
                {isBetaUser ? (
                  <svg className="nut-hub-card-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                ) : (
                  <svg className="nut-hub-card-lock" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Quick-add toast */}
      {quickAddToast && (
        <div className="nhub-toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          <span>Added {quickAddToast}</span>
        </div>
      )}

      <CoreBuddyNav active="nutrition" />
    </div>
  );
}
