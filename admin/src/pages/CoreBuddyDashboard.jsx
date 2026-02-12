import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyDashboard.css';

const TICK_COUNT = 60;
const WORKOUT_MILESTONES = [10, 25, 50, 100, 200, 500, 1000];
const HABIT_COUNT = 5;

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getWorkoutMilestone(total) {
  let prev = 0;
  for (const m of WORKOUT_MILESTONES) {
    if (total < m) return { prev, next: m };
    prev = m;
  }
  return { prev: WORKOUT_MILESTONES[WORKOUT_MILESTONES.length - 1], next: total + 100 };
}

// Programme templates (must match CoreBuddyProgrammes)
const TEMPLATE_META = {
  fullbody_4wk: { duration: 4, daysPerWeek: 3 },
  fullbody_8wk: { duration: 8, daysPerWeek: 3 },
  fullbody_12wk: { duration: 12, daysPerWeek: 3 },
  core_4wk: { duration: 4, daysPerWeek: 3 },
  core_8wk: { duration: 8, daysPerWeek: 3 },
  core_12wk: { duration: 12, daysPerWeek: 3 },
  upper_4wk: { duration: 4, daysPerWeek: 3 },
  lower_4wk: { duration: 4, daysPerWeek: 3 },
};

export default function CoreBuddyDashboard() {
  const { currentUser, isClient, clientData, logout, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // 24hr countdown state
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [ticksElapsed, setTicksElapsed] = useState(0);

  // Ring stats
  const [programmePct, setProgrammePct] = useState(0);
  const [programmeName, setProgrammeName] = useState('');
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [habitWeekPct, setHabitWeekPct] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate('/');
    }
  }, [authLoading, currentUser, navigate]);

  // 24hr countdown - time remaining in the day
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const diff = endOfDay - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });

      // Calculate ticks elapsed out of 60 based on seconds
      setTicksElapsed(60 - seconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load ring stats
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const loadStats = async () => {
      try {
        // 1. Programme progress
        const progSnap = await getDoc(doc(db, 'clientProgrammes', clientData.id));
        if (progSnap.exists()) {
          const prog = progSnap.data();
          const meta = TEMPLATE_META[prog.templateId];
          if (meta) {
            const completed = Object.keys(prog.completedSessions || {}).length;
            const total = meta.duration * meta.daysPerWeek;
            setProgrammePct(total > 0 ? Math.round((completed / total) * 100) : 0);
            const name = prog.templateId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            setProgrammeName(name);
          }
        }

        // 2. Total randomiser workouts
        const logsRef = collection(db, 'workoutLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        const logsSnap = await getDocs(q);
        const randomiserCount = logsSnap.docs.filter(d => d.data().type !== 'programme').length;
        setTotalWorkouts(randomiserCount);

        // 3. Habit completion today
        const todayStr = formatDate(new Date());
        const habitRef = collection(db, 'habitLogs');
        const hq = query(habitRef, where('clientId', '==', clientData.id), where('date', '==', todayStr));
        const habitSnap = await getDocs(hq);
        let todayCompleted = 0;
        if (!habitSnap.empty) {
          const habits = habitSnap.docs[0].data().habits || {};
          todayCompleted = Object.values(habits).filter(Boolean).length;
        }
        setHabitWeekPct(Math.round((todayCompleted / HABIT_COUNT) * 100));
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setStatsLoaded(true);
      }
    };
    loadStats();
  }, [currentUser, clientData]);

  // Ripple effect
  const createRipple = (event) => {
    const button = event.currentTarget;
    const existingRipple = button.querySelector('.ripple');
    if (existingRipple) existingRipple.remove();
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };

  const firstName = clientData?.name?.split(' ')[0] || 'there';

  // Calculate ring ticks for 3 stat rings
  const programmeTicks = Math.round((programmePct / 100) * TICK_COUNT);
  const { prev: wPrev, next: wNext } = getWorkoutMilestone(totalWorkouts);
  const workoutPct = wNext > wPrev ? Math.round(((totalWorkouts - wPrev) / (wNext - wPrev)) * 100) : 100;
  const workoutTicks = Math.round((workoutPct / 100) * TICK_COUNT);
  const habitTicks = Math.round((habitWeekPct / 100) * TICK_COUNT);

  const statRings = [
    { label: 'Programme', value: `${programmePct}%`, ticks: programmeTicks, cls: 'cb-stat-programme' },
    { label: 'Workouts', value: `${totalWorkouts}`, ticks: workoutTicks, cls: 'cb-stat-workouts' },
    { label: 'Habits Today', value: `${habitWeekPct}%`, ticks: habitTicks, cls: 'cb-stat-habits' },
  ];

  if (authLoading) {
    return (
      <div className="cb-loading">
        <div className="cb-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="cb-dashboard" data-theme={isDark ? 'dark' : 'light'}>
      {/* Header */}
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            <button onClick={logout} aria-label="Log out">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="cb-main">
        {/* Greeting */}
        <div className="cb-greeting">
          <h2>Hey {firstName}</h2>
        </div>

        {/* 24hr Countdown Ring */}
        <div className="cb-ring-container">
          <div className="cb-ring">
            <svg className="cb-ring-svg" viewBox="0 0 200 200">
              {[...Array(60)].map((_, i) => {
                const angle = (i * 6 - 90) * (Math.PI / 180);
                const innerRadius = 85;
                const outerRadius = 96;
                const x1 = 100 + innerRadius * Math.cos(angle);
                const y1 = 100 + innerRadius * Math.sin(angle);
                const x2 = 100 + outerRadius * Math.cos(angle);
                const y2 = 100 + outerRadius * Math.sin(angle);
                const isElapsed = i < ticksElapsed;

                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    className={`ring-tick ${isElapsed ? 'elapsed' : 'remaining'}`}
                    strokeWidth={i % 5 === 0 ? '3' : '2'}
                  />
                );
              })}
            </svg>
            <div className="cb-ring-center">
              <div className="cb-ring-logo">
                <img src="/Logo.PNG" alt="Mind Core Fitness" />
              </div>
              <div className="cb-ring-countdown">
                <span className="cb-timer-digit">{String(timeLeft.hours).padStart(2, '0')}</span>
                <span className="cb-timer-colon">:</span>
                <span className="cb-timer-digit">{String(timeLeft.minutes).padStart(2, '0')}</span>
                <span className="cb-timer-colon">:</span>
                <span className="cb-timer-digit cb-timer-seconds">{String(timeLeft.seconds).padStart(2, '0')}</span>
              </div>
              <div className="cb-ring-label">remaining today</div>
            </div>
          </div>
          <p className="cb-ring-tagline">You have 24 hours a day... <strong>make it count</strong> with Core Buddy</p>
        </div>

        {/* Stats Rings Row */}
        {statsLoaded && (
          <div className="cb-stats-row">
            {statRings.map((ring) => (
              <div key={ring.cls} className="cb-stat-item">
                <div className={`cb-stat-ring ${ring.cls}`}>
                  <svg viewBox="0 0 100 100">
                    {[...Array(TICK_COUNT)].map((_, i) => {
                      const angle = (i * 6 - 90) * (Math.PI / 180);
                      const x1 = 50 + 38 * Math.cos(angle);
                      const y1 = 50 + 38 * Math.sin(angle);
                      const x2 = 50 + 46 * Math.cos(angle);
                      const y2 = 50 + 46 * Math.sin(angle);
                      return (
                        <line
                          key={i}
                          x1={x1} y1={y1} x2={x2} y2={y2}
                          className={i < ring.ticks ? 'cb-stat-filled' : 'cb-stat-empty'}
                          strokeWidth={i % 5 === 0 ? '3' : '2'}
                        />
                      );
                    })}
                  </svg>
                  <span className="cb-stat-value">{ring.value}</span>
                </div>
                <span className="cb-stat-label">{ring.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Feature Cards */}
        <div className="cb-features">

          {/* 1. Nutrition / Macros */}
          <button
            className="cb-feature-card cb-card-nutrition cb-card-has-preview ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/nutrition'); }}
          >
            <div className="cb-card-top-row">
              <div className="cb-card-content">
                <h3>Today's Nutrition</h3>
              </div>
              <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
            <div className="cb-card-preview-row">
              <div className="cb-mini-rings">
                {[
                  { cls: 'cb-ring-protein', label: 'P', filled: 15 },
                  { cls: 'cb-ring-carbs', label: 'C', filled: 28 },
                  { cls: 'cb-ring-fats', label: 'F', filled: 38 },
                  { cls: 'cb-ring-cals', label: 'Cal', filled: 22 },
                ].map((ring) => (
                  <div key={ring.cls} className={`cb-mini-ring ${ring.cls}`}>
                    <svg viewBox="0 0 100 100">
                      {[...Array(60)].map((_, i) => {
                        const angle = (i * 6 - 90) * (Math.PI / 180);
                        const x1 = 50 + 38 * Math.cos(angle);
                        const y1 = 50 + 38 * Math.sin(angle);
                        const x2 = 50 + 46 * Math.cos(angle);
                        const y2 = 50 + 46 * Math.sin(angle);
                        return (
                          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                            className={i < ring.filled ? 'cb-tick-filled' : 'cb-tick-empty'}
                            strokeWidth={i % 5 === 0 ? '3' : '2'} />
                        );
                      })}
                    </svg>
                    <span>{ring.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="cb-card-desc">Track macros, scan barcodes, log water</p>
          </button>

          {/* 2. Workouts */}
          <button
            className="cb-feature-card cb-card-workouts ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/workouts'); }}
          >
            <div className="cb-card-content">
              <h3>Workouts</h3>
              <p>Randomise or pick a programme</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 3. Daily Habits */}
          <button
            className="cb-feature-card cb-card-consistency ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/consistency'); }}
          >
            <div className="cb-card-content">
              <h3>Daily Habits</h3>
              <p>Check off your daily habits and build streaks</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 4. Progress / PBs */}
          <button
            className="cb-feature-card cb-card-progress ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/personal-bests?mode=corebuddy'); }}
          >
            <div className="cb-card-content">
              <h3>My Progress</h3>
              <p>Track personal bests and body metrics</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* 6. Leaderboard */}
          <button
            className="cb-feature-card cb-card-leaderboard ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/leaderboard'); }}
          >
            <div className="cb-card-content">
              <h3>Leaderboard</h3>
              <p>Compete with your Core Buddies</p>
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.type === 'info' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
