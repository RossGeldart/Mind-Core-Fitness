import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyConsistency.css';
import CoreBuddyNav from '../components/CoreBuddyNav';


const DEFAULT_HABITS = [
  { key: 'trained', label: 'Trained', icon: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2.71 7 4.14 8.43 7.71 4.86 16.29 13.43 12.71 17 14.14 18.43 15.57 17 17 18.43 14.14 21.29l1.43 1.43 1.43-1.43 1.43 1.43 2.14-2.14 1.43 1.43L22 20.57z' },
  { key: 'protein', label: 'Hit Protein', icon: 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z' },
  { key: 'steps', label: '10k Steps', icon: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7' },
  { key: 'sleep', label: '8hrs Sleep', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' },
  { key: 'water', label: '2L Water', icon: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z' },
];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getWeekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function CoreBuddyConsistency() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme, accent } = useTheme();
  const navigate = useNavigate();

  const [habitLogs, setHabitLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [streak, setStreak] = useState(0);
  const [toast, setToast] = useState(null);
  const [justChecked, setJustChecked] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const particlesRef = useRef([]);
  const confettiRef = useRef([]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const today = new Date();
  const todayStr = formatDate(today);
  const monday = getMonday(today);
  const weekDates = getWeekDates(monday);
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load all habit logs
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const load = async () => {
      try {
        const logsRef = collection(db, 'habitLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        const snap = await getDocs(q);
        const logs = {};
        snap.docs.forEach(d => {
          const data = d.data();
          logs[data.date] = { ...data, _id: d.id };
        });
        setHabitLogs(logs);

        // Calculate streak
        let s = 0;
        const checkDate = new Date(today);
        while (true) {
          const dateStr = formatDate(checkDate);
          const log = logs[dateStr];
          if (log) {
            const completed = Object.values(log.habits || {}).filter(Boolean).length;
            if (completed >= 3) {
              s++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          } else {
            // If today has no log yet, don't break streak
            if (dateStr === todayStr) {
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              break;
            }
          }
        }
        setStreak(s);
      } catch (err) {
        console.error('Error loading habit logs:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser, clientData]);

  const todayLog = habitLogs[todayStr] || { habits: {} };

  const toggleHabit = async (habitKey) => {
    if (!currentUser || saving) return;
    const wasChecked = todayLog.habits?.[habitKey] || false;

    // Trigger check animation (only when checking, not unchecking)
    if (!wasChecked) {
      particlesRef.current = [...Array(10)].map((_, i) => {
        const angle = (i / 10) * 2 * Math.PI;
        const dist = 18 + Math.random() * 20;
        return {
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist,
          size: 3 + Math.random() * 4,
          duration: 0.4 + Math.random() * 0.3,
        };
      });
      setJustChecked(habitKey);
      setTimeout(() => setJustChecked(null), 700);
    }

    setSaving(true);
    try {
      const current = todayLog.habits || {};
      const updated = { ...current, [habitKey]: !current[habitKey] };
      const docId = todayLog._id || `${clientData.id}_${todayStr}`;

      await setDoc(doc(db, 'habitLogs', docId), {
        clientId: clientData.id,
        date: todayStr,
        habits: updated,
      });

      setHabitLogs(prev => ({
        ...prev,
        [todayStr]: { clientId: clientData.id, date: todayStr, habits: updated, _id: docId },
      }));

      // All habits complete — trigger celebration
      const completedCount = Object.values(updated).filter(Boolean).length;
      if (completedCount === DEFAULT_HABITS.length && !wasChecked) {
        confettiRef.current = [...Array(50)].map((_, i) => ({
          x: 5 + Math.random() * 90,
          delay: Math.random() * 0.6,
          color: ['#4caf50', '#ff9800', '#2196f3', '#e91e63', '#ffeb3b', '#9c27b0'][i % 6],
          drift: (Math.random() - 0.5) * 120,
          spin: Math.random() * 720 - 360,
          duration: 1.5 + Math.random() * 1.5,
          width: 4 + Math.random() * 8,
          height: 4 + Math.random() * 10,
        }));
        setTimeout(() => {
          setShowCelebration(true);
          setTimeout(() => setShowCelebration(false), 3500);
        }, 500);
      }
    } catch (err) {
      console.error('Error saving habit:', err);
      showToast('Failed to save. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Weekly stats
  const weeklyStats = weekDates.map(date => {
    const dateStr = formatDate(date);
    const log = habitLogs[dateStr];
    const completed = log ? Object.values(log.habits || {}).filter(Boolean).length : 0;
    return { date, dateStr, completed, total: DEFAULT_HABITS.length };
  });

  const weeklyCompleted = weeklyStats.reduce((sum, d) => sum + d.completed, 0);
  const weeklyTotal = weeklyStats.reduce((sum, d) => sum + d.total, 0);
  const weeklyPct = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

  const todayCompleted = Object.values(todayLog.habits || {}).filter(Boolean).length;
  const todayPct = Math.round((todayCompleted / DEFAULT_HABITS.length) * 100);

  return (
    <div className="cbc-page" data-theme={isDark ? 'dark' : 'light'} data-accent={accent}>
      {/* Header */}
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

      {(authLoading || loading) ? (
        <div className="cbc-loading-inline"><div className="cbc-loading-spinner" /></div>
      ) : (
      <main className="cbc-main">
        {/* Today's Progress Ring */}
        <div className="cbc-ring-section">
          <div className="cbc-progress-ring">
            <svg viewBox="0 0 200 200">
              <circle className="cbc-arc-track" cx="100" cy="100" r="80" />
              <circle className="cbc-arc-fill" cx="100" cy="100" r="80"
                strokeDasharray={2 * Math.PI * 80}
                strokeDashoffset={2 * Math.PI * 80 - (todayPct / 100) * 2 * Math.PI * 80} />
            </svg>
            <div className="cbc-ring-center">
              <span className="cbc-ring-pct">{todayPct}%</span>
              <span className="cbc-ring-label">today</span>
            </div>
          </div>

          {/* Streak */}
          <div className="cbc-streak">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            <span className="cbc-streak-count">{streak}</span>
            <span className="cbc-streak-label">day streak</span>
          </div>
        </div>

        {/* Today's Habits */}
        <div className="cbc-section">
          <h2 className="cbc-section-title">Today's Habits</h2>
          <div className="cbc-habits">
            {DEFAULT_HABITS.map((habit) => {
              const checked = todayLog.habits?.[habit.key] || false;
              const isJustChecked = justChecked === habit.key;
              return (
                <button
                  key={habit.key}
                  className={`cbc-habit-btn cbc-habit-${habit.key} ${checked ? 'cbc-habit-done' : ''} ${isJustChecked ? 'cbc-habit-just-checked' : ''}`}
                  onClick={() => toggleHabit(habit.key)}
                  disabled={saving}
                >
                  <div className="cbc-habit-check">
                    {checked ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" className={`cbc-check-path ${isJustChecked ? 'cbc-check-animate' : ''}`} />
                      </svg>
                    ) : (
                      <div className="cbc-habit-circle" />
                    )}
                  </div>
                  {isJustChecked && (
                    <div className="cbc-particles">
                      {particlesRef.current.map((p, i) => (
                        <span key={i} className="cbc-particle" style={{
                          '--tx': `${p.tx}px`,
                          '--ty': `${p.ty}px`,
                          '--size': `${p.size}px`,
                          animationDuration: `${p.duration}s`,
                        }} />
                      ))}
                    </div>
                  )}
                  <div className={`cbc-habit-icon cbc-icon-${habit.key}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d={habit.icon} />
                    </svg>
                  </div>
                  <span className="cbc-habit-label">{habit.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Weekly Overview */}
        <div className="cbc-section">
          <h2 className="cbc-section-title">This Week</h2>
          <div className="cbc-week-grid">
            {weeklyStats.map((day, i) => {
              const isToday = day.dateStr === todayStr;
              const pct = day.total > 0 ? day.completed / day.total : 0;
              const r = 38;
              const circ = 2 * Math.PI * r;
              const offset = circ - pct * circ;
              return (
                <div key={i} className={`cbc-day-ring ${isToday ? 'cbc-day-today' : ''} ${day.completed > 0 ? 'cbc-day-active' : ''}`}>
                  <svg viewBox="0 0 100 100">
                    <circle className="cbc-day-track" cx="50" cy="50" r={r} />
                    <circle className="cbc-day-fill" cx="50" cy="50" r={r}
                      strokeDasharray={circ}
                      strokeDashoffset={offset} />
                  </svg>
                  <span className="cbc-day-label">{dayLabels[i]}</span>
                  <span className="cbc-day-count">{day.completed}/{day.total}</span>
                </div>
              );
            })}
          </div>

          {/* Weekly summary bar */}
          <div className="cbc-week-summary">
            <div className="cbc-week-summary-bar">
              <div className="cbc-week-summary-fill" style={{ width: `${weeklyPct}%` }} />
            </div>
            <span className="cbc-week-summary-text">{weeklyCompleted} / {weeklyTotal} habits this week ({weeklyPct}%)</span>
          </div>
        </div>
      </main>
      )}

      {/* Core Buddy Bottom Nav */}
      <CoreBuddyNav active="home" />

      {/* All-done celebration */}
      {showCelebration && (
        <div className="cbc-celebration" onClick={() => setShowCelebration(false)}>
          <div className="cbc-confetti-container">
            {confettiRef.current.map((c, i) => (
              <span key={i} className="cbc-confetti-piece" style={{
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
          <div className="cbc-celebration-card">
            <svg className="cbc-celebration-icon" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <h2 className="cbc-celebration-title">Crushed it!</h2>
            <p className="cbc-celebration-sub">All habits complete today</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
