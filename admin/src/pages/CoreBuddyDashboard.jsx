import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyDashboard.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import { TICKS_85_96 } from '../utils/ringTicks';

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

const TEMPLATE_DAYS = {
  fullbody_4wk: ['Push Focus', 'Pull Focus', 'Legs & Core'],
  fullbody_8wk: ['Strength', 'Power', 'Endurance'],
  fullbody_12wk: ['Upper Push', 'Lower Body', 'Upper Pull'],
  core_4wk: ['Abs', 'Stability', 'Power Core'],
  core_8wk: ['Anti-Extension', 'Rotation', 'Power'],
  core_12wk: ['Strength', 'Endurance', 'Power'],
  upper_4wk: ['Push', 'Pull', 'Mixed'],
  lower_4wk: ['Quad Dominant', 'Hamstring & Glute', 'Power & Stability'],
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
  const [nutritionTotals, setNutritionTotals] = useState({ protein: 0, carbs: 0, fats: 0, calories: 0 });
  const [nutritionTargetData, setNutritionTargetData] = useState(null);
  const [todayHabitsCount, setTodayHabitsCount] = useState(0);
  const [nextSession, setNextSession] = useState(null);
  const [hasProgramme, setHasProgramme] = useState(false);
  const [programmeComplete, setProgrammeComplete] = useState(false);
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [pbCount, setPbCount] = useState(0);
  const [topPBs, setTopPBs] = useState([]);
  const [leaderboardTop3, setLeaderboardTop3] = useState([]);

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
        const todayStr = formatDate(new Date());

        // 1. Programme progress + next session
        const progSnap = await getDoc(doc(db, 'clientProgrammes', clientData.id));
        if (progSnap.exists()) {
          const prog = progSnap.data();
          const meta = TEMPLATE_META[prog.templateId];
          setHasProgramme(true);
          if (meta) {
            const completedKeys = prog.completedSessions || {};
            const completedCount = Object.keys(completedKeys).length;
            const total = meta.duration * meta.daysPerWeek;
            setProgrammePct(total > 0 ? Math.round((completedCount / total) * 100) : 0);
            const name = prog.templateId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            setProgrammeName(name);
            // Find next uncompleted session
            const dayLabels = TEMPLATE_DAYS[prog.templateId];
            let foundNext = false;
            for (let w = 1; w <= meta.duration && !foundNext; w++) {
              for (let d = 0; d < meta.daysPerWeek && !foundNext; d++) {
                if (!completedKeys[`w${w}d${d}`]) {
                  setNextSession({ week: w, dayIdx: d, label: dayLabels?.[d] || `Day ${d + 1}` });
                  foundNext = true;
                }
              }
            }
            if (!foundNext) setProgrammeComplete(true);
          }
        }

        // 2. Total randomiser workouts
        const logsRef = collection(db, 'workoutLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        const logsSnap = await getDocs(q);
        const randomiserCount = logsSnap.docs.filter(d => d.data().type !== 'programme').length;
        setTotalWorkouts(randomiserCount);
        // Weekly workout count (Mon-Sun)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - mondayOffset);
        monday.setHours(0, 0, 0, 0);
        const mondayStr = formatDate(monday);
        const weekCount = logsSnap.docs.filter(d => (d.data().date || '') >= mondayStr).length;
        setWeeklyWorkouts(weekCount);

        // 3. Habit completion today
        const habitRef = collection(db, 'habitLogs');
        const hq = query(habitRef, where('clientId', '==', clientData.id), where('date', '==', todayStr));
        const habitSnap = await getDocs(hq);
        let todayCompleted = 0;
        if (!habitSnap.empty) {
          const habits = habitSnap.docs[0].data().habits || {};
          todayCompleted = Object.values(habits).filter(Boolean).length;
        }
        setHabitWeekPct(Math.round((todayCompleted / HABIT_COUNT) * 100));
        setTodayHabitsCount(todayCompleted);

        // 4. Nutrition targets
        const targetSnap = await getDoc(doc(db, 'nutritionTargets', clientData.id));
        if (targetSnap.exists()) {
          setNutritionTargetData(targetSnap.data());
        }

        // 5. Today's nutrition log
        const nutLogSnap = await getDoc(doc(db, 'nutritionLogs', `${clientData.id}_${todayStr}`));
        if (nutLogSnap.exists()) {
          const entries = nutLogSnap.data().entries || [];
          const totals = entries.reduce((acc, e) => ({
            protein: acc.protein + (e.protein || 0),
            carbs: acc.carbs + (e.carbs || 0),
            fats: acc.fats + (e.fats || 0),
            calories: acc.calories + (e.calories || 0),
          }), { protein: 0, carbs: 0, fats: 0, calories: 0 });
          setNutritionTotals(totals);
        }
        // 6. Core Buddy PBs count
        const pbSnap = await getDoc(doc(db, 'coreBuddyPBs', clientData.id));
        if (pbSnap.exists()) {
          const exercises = pbSnap.data().exercises || {};
          setPbCount(Object.keys(exercises).length);
          const sorted = Object.entries(exercises)
            .sort(([, a], [, b]) => (b.weight || 0) - (a.weight || 0))
            .slice(0, 3)
            .map(([name, data]) => ({ name, weight: data.weight, reps: data.reps }));
          setTopPBs(sorted);
        }

        // 7. Leaderboard top 3 preview (opted-in clients)
        try {
          const clientsRef = collection(db, 'clients');
          const cq = query(clientsRef, where('leaderboardOptIn', '==', true));
          const clientsSnap = await getDocs(cq);
          const optedIn = clientsSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
          setLeaderboardTop3(optedIn.slice(0, 3));
        } catch (lbErr) {
          console.error('Leaderboard preview error:', lbErr);
        }
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

  // Calculate percentages for 3 stat rings (solid arc style)
  const { prev: wPrev, next: wNext } = getWorkoutMilestone(totalWorkouts);
  const workoutPct = wNext > wPrev ? Math.round(((totalWorkouts - wPrev) / (wNext - wPrev)) * 100) : 100;

  const statRings = [
    { label: 'Programme', value: `${programmePct}%`, pct: programmePct, color: '#14b8a6', size: 'normal' },
    { label: 'Workouts', value: `${totalWorkouts}`, pct: workoutPct, color: 'var(--color-primary)', size: 'large' },
    { label: 'Habits Today', value: `${habitWeekPct}%`, pct: habitWeekPct, color: '#38B6FF', size: 'normal' },
  ];

  // Nutrition percentage helper
  const nutPct = (key) => {
    if (!nutritionTargetData || !nutritionTargetData[key]) return 0;
    return Math.min(Math.round((nutritionTotals[key] / nutritionTargetData[key]) * 100), 100);
  };

  // Time-aware coach message
  const coachLine = (() => {
    const hour = new Date().getHours();
    const allDone = statsLoaded && todayHabitsCount >= HABIT_COUNT && nutritionTotals.calories > 0;
    if (allDone) return { main: `Smashed it today,`, sub: 'Rest up and go again tomorrow.' };
    if (hour >= 5 && hour < 12) return { main: `Rise and grind,`, sub: "let's get after it!" };
    if (hour >= 12 && hour < 17) return { main: `Oye`, sub: 'crack on and make it count!' };
    if (hour >= 17 && hour < 21) return { main: `Evening session?`, sub: "Let's finish strong!" };
    return { main: `Burning the midnight oil,`, sub: 'Respect the hustle!' };
  })();

  // Priority-based smart nudge
  const nudge = (() => {
    if (!statsLoaded) return null;
    // 1. Active programme with next session
    if (hasProgramme && nextSession && !programmeComplete) {
      return {
        label: 'NEXT SESSION',
        message: `Week ${nextSession.week}, Day ${nextSession.dayIdx + 1} — ${nextSession.label}`,
        cta: 'Continue',
        action: () => navigate('/client/core-buddy/programmes'),
        pct: programmePct,
        ringLabel: `${programmePct}%`,
      };
    }
    // 2. Habits not all done
    if (todayHabitsCount < HABIT_COUNT) {
      return {
        label: 'DAILY HABITS',
        message: `${todayHabitsCount}/${HABIT_COUNT} completed`,
        cta: 'Open Habits',
        action: () => navigate('/client/core-buddy/consistency'),
        pct: habitWeekPct,
        ringLabel: `${todayHabitsCount}/${HABIT_COUNT}`,
      };
    }
    // 3. No nutrition logged
    if (nutritionTotals.calories === 0) {
      return {
        label: 'NUTRITION',
        message: 'No meals logged today',
        cta: 'Log Meal',
        action: () => navigate('/client/core-buddy/nutrition'),
        pct: 0,
        ringLabel: '0',
      };
    }
    // 4. No programme active
    if (!hasProgramme) {
      return {
        label: 'PROGRAMMES',
        message: 'Start a programme to level up',
        cta: 'Browse',
        action: () => navigate('/client/core-buddy/workouts'),
        pct: 0,
        ringLabel: '\u2014',
      };
    }
    // 5. Programme complete
    if (programmeComplete) {
      return {
        label: 'COMPLETE',
        message: 'Programme finished!',
        cta: 'New Programme',
        action: () => navigate('/client/core-buddy/workouts'),
        pct: 100,
        ringLabel: '100%',
      };
    }
    // 6. Everything done
    return {
      label: 'TODAY',
      message: "You're crushing it!",
      cta: null,
      action: null,
      pct: 100,
      ringLabel: '\u2713',
    };
  })();

  return (
    <div className="cb-dashboard" data-theme={isDark ? 'dark' : 'light'}>
      {/* Header */}
      <header className="client-header">
        <div className="header-content">
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
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
        {/* 24hr Countdown Ring */}
        <div className="cb-ring-container">
          <div className="cb-ring">
            <svg className="cb-ring-svg" viewBox="0 0 200 200">
              {TICKS_85_96.map((t, i) => {
                const isElapsed = i < ticksElapsed;
                return (
                  <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                    className={`ring-tick ${isElapsed ? 'elapsed' : 'remaining'}`}
                    strokeWidth={t.thick ? '3' : '2'} />
                );
              })}
            </svg>
            <div className="cb-ring-center">
              <div className="cb-ring-logo">
                <img src="/Logo.webp" alt="Mind Core Fitness" />
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

        {/* Stats Rings Row — always rendered to prevent layout shift */}
        <div className="cb-stats-row">
          {statRings.map((ring) => {
            const r = ring.size === 'large' ? 38 : 38;
            const circ = 2 * Math.PI * r;
            const offset = circ - (ring.pct / 100) * circ;
            return (
              <div key={ring.label} className={`cb-stat-item${ring.size === 'large' ? ' cb-stat-large' : ''}`}>
                <div className="cb-stat-ring">
                  <svg viewBox="0 0 100 100">
                    <circle className="cb-stat-track" cx="50" cy="50" r={r} />
                    <circle className="cb-stat-fill" cx="50" cy="50" r={r}
                      style={{ stroke: ring.color }}
                      strokeDasharray={circ}
                      strokeDashoffset={offset} />
                  </svg>
                  <span className="cb-stat-value" style={{ color: ring.color }}>{ring.value}</span>
                </div>
                <span className="cb-stat-label">{ring.label}</span>
              </div>
            );
          })}
        </div>

        {/* Coach Message */}
        <p className="cb-coach-msg">{coachLine.main} <strong>{firstName}</strong> — {coachLine.sub}</p>

        {/* Smart Nudge Card */}
        {nudge && (
          <button className="cb-nudge-card" onClick={nudge.action || undefined}
            style={nudge.action ? undefined : { cursor: 'default' }}>
            <div className="cb-nudge-ring">
              <svg viewBox="0 0 100 100">
                <circle className="cb-nudge-ring-track" cx="50" cy="50" r="38" />
                <circle className="cb-nudge-ring-fill" cx="50" cy="50" r="38"
                  strokeDasharray={2 * Math.PI * 38}
                  strokeDashoffset={2 * Math.PI * 38 - (nudge.pct / 100) * 2 * Math.PI * 38} />
              </svg>
              <span className="cb-nudge-ring-val">{nudge.ringLabel}</span>
            </div>
            <div className="cb-nudge-info">
              <span className="cb-nudge-label">{nudge.label}</span>
              <span className="cb-nudge-title">{nudge.message}</span>
              {nudge.cta && <span className="cb-nudge-cta">{nudge.cta} &rarr;</span>}
            </div>
          </button>
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
                  { label: 'P', pct: nutPct('protein'), color: '#14b8a6' },
                  { label: 'C', pct: nutPct('carbs'), color: 'var(--color-primary)' },
                  { label: 'F', pct: nutPct('fats'), color: '#eab308' },
                  { label: 'Cal', pct: nutPct('calories'), color: '#38B6FF' },
                ].map((ring) => {
                  const r = 38;
                  const circ = 2 * Math.PI * r;
                  const off = circ - (ring.pct / 100) * circ;
                  return (
                    <div key={ring.label} className="cb-mini-ring">
                      <svg viewBox="0 0 100 100">
                        <circle className="cb-mini-track" cx="50" cy="50" r={r} />
                        <circle className="cb-mini-fill" cx="50" cy="50" r={r}
                          style={{ stroke: ring.color }}
                          strokeDasharray={circ}
                          strokeDashoffset={off} />
                      </svg>
                      <span style={{ color: ring.color }}>{ring.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="cb-card-desc">Track macros, scan barcodes, log water</p>
          </button>

          {/* 2. Workouts */}
          <button
            className="cb-feature-card cb-card-workouts-hero ripple-btn"
            onClick={(e) => { createRipple(e); navigate('/client/core-buddy/workouts'); }}
          >
            <h3 className="cb-hero-title">Workouts</h3>
            <div className="cb-hero-stats">
              <span>{weeklyWorkouts} this week</span>
              <span className="cb-hero-dot">&middot;</span>
              <span>{totalWorkouts} total</span>
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
              <div className="cb-habit-dots">
                {Array.from({ length: HABIT_COUNT }, (_, i) => (
                  <span key={i} className={`cb-habit-dot${i < todayHabitsCount ? ' done' : ''}`} />
                ))}
                <span className="cb-habit-dots-label">{todayHabitsCount}/{HABIT_COUNT}</span>
              </div>
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
              {topPBs.length > 0 ? (
                <div className="cb-pb-preview">
                  {topPBs.map((pb, idx) => (
                    <div key={pb.name} className="cb-pb-entry">
                      <span className="cb-pb-name">{pb.name}</span>
                      <span className="cb-pb-value">{pb.weight}kg × {pb.reps}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cb-progress-preview">
                  <svg className="cb-progress-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  <span>No PBs yet — start lifting!</span>
                </div>
              )}
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
              {leaderboardTop3.length > 0 ? (
                <div className="cb-lb-preview">
                  {leaderboardTop3.map((entry, idx) => {
                    const medal = ['#FFD700', '#A8B4C0', '#CD7F32'][idx];
                    const initials = entry.name ? entry.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?';
                    const isMe = entry.id === clientData?.id;
                    return (
                      <div key={entry.id} className={`cb-lb-entry${isMe ? ' cb-lb-me' : ''}`}>
                        <div className="cb-lb-avatar" style={{ borderColor: medal }}>
                          <span>{initials}</span>
                        </div>
                        <span className="cb-lb-rank" style={{ color: medal }}>#{idx + 1}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>Opt in to compete with your Core Buddies</p>
              )}
            </div>
            <svg className="cb-card-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>

        </div>
      </main>

      {/* Core Buddy Bottom Nav */}
      <CoreBuddyNav active="home" />

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
