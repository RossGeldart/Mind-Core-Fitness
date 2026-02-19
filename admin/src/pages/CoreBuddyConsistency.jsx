import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import './CoreBuddyConsistency.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import PullToRefresh from '../components/PullToRefresh';
import WorkoutCelebration from '../components/WorkoutCelebration';


const DEFAULT_HABITS = [
  { key: 'trained', label: 'Trained', icon: 'M4 10v4M8 7v10M8 12h8M16 7v10M20 10v4', color: '#A12F3A', darkColor: '#E8475A' },
  { key: 'protein', label: 'Hit Protein', icon: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zM12 18c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', color: '#4caf50', darkColor: '#5CDB61' },
  { key: 'steps', label: '10k Steps', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 12.5A2.5 2.5 0 0 1 6.5 10H20M4 5.5A2.5 2.5 0 0 1 6.5 3H20', color: '#ff9800', darkColor: '#FFB020' },
  { key: 'sleep', label: '8hrs Sleep', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', color: '#7c3aed', darkColor: '#9B5AF2' },
  { key: 'water', label: '2L Water', icon: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z', color: '#2196f3', darkColor: '#42A5F5' },
];

// Icon for custom habits (sparkle)
const CUSTOM_ICON = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';
const CUSTOM_COLOR = '#e91e63';
const CUSTOM_DARK_COLOR = '#FF4D88';

const HOLD_DURATION = 700; // ms
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const CELEBRATION_QUOTES = [
  'Every day counts. See you tomorrow!',
  'Consistency is your superpower.',
  'Perfect day — keep the streak alive!',
  'You showed up for yourself today.',
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
  const { isPremium, FREE_HABIT_LIMIT } = useTier();
  const navigate = useNavigate();

  const [habitLogs, setHabitLogs] = useState({});
  const [customHabits, setCustomHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [streak, setStreak] = useState(0);
  const [toast, setToast] = useState(null);
  const [justChecked, setJustChecked] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationDismissing, setCelebrationDismissing] = useState(false);
  const [celebrationShownToday, setCelebrationShownToday] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [hiddenDefaults, setHiddenDefaults] = useState([]);
  const [holdingHabit, setHoldingHabit] = useState(null);
  const holdTimerRef = useRef(null);
  const holdStartRef = useRef(null);
  const rafRef = useRef(null);
  const activeHoldKeyRef = useRef(null);
  const holdJustCompletedRef = useRef(false);
  const ringRefs = useRef({});
  const particlesRef = useRef([]);
  const confettiRef = useRef([]);
  const celebrationBtnRef = useRef(null);
  const celebrationQuoteRef = useRef(CELEBRATION_QUOTES[Math.floor(Math.random() * CELEBRATION_QUOTES.length)]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const today = new Date();
  const todayStr = formatDate(today);
  const monday = getMonday(today);
  const weekDates = getWeekDates(monday);
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // Merged habits list (exclude hidden defaults) — resolve dark mode colors
  const resolveColor = (light, dark) => isDark && dark ? dark : light;
  const allHabitsRaw = [
    ...DEFAULT_HABITS.filter(h => !hiddenDefaults.includes(h.key)).map(h => ({ ...h, color: resolveColor(h.color, h.darkColor) })),
    ...customHabits.map(h => ({ key: `custom_${h.id}`, label: h.label, icon: CUSTOM_ICON, color: resolveColor(CUSTOM_COLOR, CUSTOM_DARK_COLOR), isCustom: true, id: h.id })),
  ];
  const allHabits = isPremium ? allHabitsRaw : allHabitsRaw.slice(0, FREE_HABIT_LIMIT);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load habit logs + custom habits
  useEffect(() => {
    if (!currentUser || !clientData) return;
    const load = async () => {
      try {
        // Load logs
        const logsRef = collection(db, 'habitLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id));
        const snap = await getDocs(q);
        const logs = {};
        snap.docs.forEach(d => {
          const data = d.data();
          logs[data.date] = { ...data, _id: d.id };
        });
        setHabitLogs(logs);

        // Load custom habits + hidden defaults
        const customDoc = await getDoc(doc(db, 'customHabits', clientData.id));
        if (customDoc.exists()) {
          const data = customDoc.data();
          setCustomHabits(data.habits || []);
          setHiddenDefaults(data.hiddenDefaults || []);
        }

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

  // Reset celebrationShownToday flag when habits change (new custom habit added or habit undone)
  useEffect(() => {
    const completedCount = Object.values(todayLog.habits || {}).filter(Boolean).length;
    if (completedCount < allHabits.length && celebrationShownToday) {
      setCelebrationShownToday(false);
    }
  }, [allHabits.length, todayLog.habits]);

  const completeHabit = async (habitKey) => {
    if (!currentUser || saving) return;
    const wasChecked = todayLog.habits?.[habitKey] || false;
    if (wasChecked) return; // Already done — no-op for hold-to-complete

    // Particle burst
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

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);

    setSaving(true);
    try {
      const current = todayLog.habits || {};
      const updated = { ...current, [habitKey]: true };
      const docId = todayLog._id || `${clientData.id}_${todayStr}`;

      // Optimistic update — mark checked immediately so ring stays full
      setHabitLogs(prev => ({
        ...prev,
        [todayStr]: { clientId: clientData.id, date: todayStr, habits: updated, _id: docId },
      }));

      await setDoc(doc(db, 'habitLogs', docId), {
        clientId: clientData.id,
        date: todayStr,
        habits: updated,
      });

      // All habits complete — trigger celebration
      const completedCount = Object.values(updated).filter(Boolean).length;
      if (completedCount === allHabits.length && !celebrationShownToday) {
        celebrationQuoteRef.current = CELEBRATION_QUOTES[Math.floor(Math.random() * CELEBRATION_QUOTES.length)];
        confettiRef.current = [...Array(80)].map((_, i) => ({
          x: 5 + Math.random() * 90,
          delay: Math.random() * 3.5,
          color: ['#A12F3A', '#4caf50', '#ff9800', '#2196f3', '#e91e63', '#ffeb3b', '#FFD700', '#ffffff', '#9c27b0'][i % 9],
          drift: (Math.random() - 0.5) * 120,
          spin: Math.random() * 720 - 360,
          duration: 1.8 + Math.random() * 2,
          width: 4 + Math.random() * 6,
          height: 4 + Math.random() * 8,
          shape: i % 3, // 0=rect, 1=circle, 2=strip
        }));
        setTimeout(() => {
          setShowCelebration(true);
          setCelebrationShownToday(true);
          // Focus the continue button for a11y
          setTimeout(() => celebrationBtnRef.current?.focus(), 1100);
        }, 400);
      }
    } catch (err) {
      console.error('Error saving habit:', err);
      showToast('Failed to save. Try again.', 'error');
      // Rollback optimistic update
      setHabitLogs(prev => ({
        ...prev,
        [todayStr]: { ...prev[todayStr], habits: { ...(prev[todayStr]?.habits || {}), [habitKey]: false } },
      }));
    } finally {
      setSaving(false);
    }
  };

  // Undo habit (tap on completed habit)
  const undoHabit = async (habitKey) => {
    if (!currentUser || saving) return;
    setSaving(true);
    try {
      const current = todayLog.habits || {};
      const updated = { ...current, [habitKey]: false };
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
    } catch (err) {
      console.error('Error undoing habit:', err);
      showToast('Failed to undo. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Press-and-hold handlers
  const startHold = (habitKey) => {
    const checked = todayLog.habits?.[habitKey] || false;
    if (checked || saving || activeHoldKeyRef.current) return;

    activeHoldKeyRef.current = habitKey;
    setHoldingHabit(habitKey);
    holdStartRef.current = performance.now();

    // Drive the ring fill via direct DOM updates (no React re-renders)
    const circle = ringRefs.current[habitKey];
    if (circle) circle.style.strokeDashoffset = RING_CIRCUMFERENCE;

    const animate = (now) => {
      const elapsed = now - holdStartRef.current;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);

      // Update SVG directly — avoids 60 re-renders/sec
      const el = ringRefs.current[habitKey];
      if (el) {
        el.style.strokeDashoffset = RING_CIRCUMFERENCE - (progress * RING_CIRCUMFERENCE);
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Hold complete — clear active hold and complete the habit
        activeHoldKeyRef.current = null;
        holdJustCompletedRef.current = true;   // suppress the click that follows pointerup
        rafRef.current = null;
        setHoldingHabit(null);
        completeHabit(habitKey);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  const cancelHold = () => {
    // No active hold to cancel — ignore (handles duplicate pointer events)
    if (!activeHoldKeyRef.current) return;

    const habitKey = activeHoldKeyRef.current;
    activeHoldKeyRef.current = null;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    // Reset the circle back to empty
    if (ringRefs.current[habitKey]) {
      ringRefs.current[habitKey].style.strokeDashoffset = RING_CIRCUMFERENCE;
    }
    setHoldingHabit(null);
    holdStartRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // Dismiss celebration overlay
  const dismissCelebration = () => {
    setCelebrationDismissing(true);
    setTimeout(() => {
      setShowCelebration(false);
      setCelebrationDismissing(false);
    }, 300);
  };

  const shareToJourney = useCallback(async (data) => {
    if (!clientData) throw new Error('Not signed in');
    const isStructured = data && typeof data === 'object' && data.type;
    await addDoc(collection(db, 'posts'), {
      authorId: clientData.id,
      authorName: clientData.name || 'Unknown',
      authorPhotoURL: clientData.photoURL || null,
      content: isStructured ? '' : data,
      type: isStructured ? data.type : 'text',
      imageURL: null,
      createdAt: serverTimestamp(),
      likeCount: 0,
      commentCount: 0,
      ...(isStructured ? { metadata: { title: data.title || '', subtitle: data.subtitle || '', stats: data.stats || [], quote: data.quote || '', badges: data.badges || [] } } : {}),
    });
  }, [clientData]);

  // Add custom habit
  const addCustomHabit = async () => {
    const name = newHabitName.trim();
    if (!name) return;
    if (!clientData?.id) {
      showToast('Still loading, try again', 'error');
      return;
    }
    const id = Date.now().toString(36);
    const updated = [...customHabits, { id, label: name }];
    try {
      await setDoc(doc(db, 'customHabits', clientData.id), {
        clientId: clientData.id,
        habits: updated,
        hiddenDefaults,
      }, { merge: true });
      setCustomHabits(updated);
      setNewHabitName('');
      setShowAddModal(false);
      showToast(`Added "${name}"`, 'success');
    } catch (err) {
      console.error('Error adding custom habit:', err);
      showToast(err?.code === 'permission-denied'
        ? 'Permission denied — check Firestore rules for customHabits'
        : `Failed to add habit: ${err?.message || 'Unknown error'}`, 'error');
    }
  };

  // Delete custom habit
  const deleteCustomHabit = async (habitId) => {
    if (!clientData?.id) return;
    const updated = customHabits.filter(h => h.id !== habitId);
    try {
      await setDoc(doc(db, 'customHabits', clientData.id), {
        clientId: clientData.id,
        habits: updated,
        hiddenDefaults,
      }, { merge: true });
      setCustomHabits(updated);
      setDeleteConfirm(null);
      showToast('Habit removed', 'success');
    } catch (err) {
      console.error('Error deleting habit:', err);
      showToast('Failed to remove', 'error');
    }
  };

  // Hide a default habit
  const hideDefaultHabit = async (habitKey) => {
    if (!clientData?.id) return;
    const updated = [...hiddenDefaults, habitKey];
    try {
      await setDoc(doc(db, 'customHabits', clientData.id), {
        clientId: clientData.id,
        habits: customHabits,
        hiddenDefaults: updated,
      }, { merge: true });
      setHiddenDefaults(updated);
      setDeleteConfirm(null);
      showToast('Habit removed', 'success');
    } catch (err) {
      console.error('Error hiding default habit:', err);
      showToast('Failed to remove', 'error');
    }
  };

  // Weekly stats
  const weeklyStats = weekDates.map(date => {
    const dateStr = formatDate(date);
    const log = habitLogs[dateStr];
    const completed = log ? Object.values(log.habits || {}).filter(Boolean).length : 0;
    return { date, dateStr, completed, total: allHabits.length };
  });

  const weeklyCompleted = weeklyStats.reduce((sum, d) => sum + d.completed, 0);
  const weeklyTotal = weeklyStats.reduce((sum, d) => sum + d.total, 0);
  const weeklyPct = weeklyTotal > 0 ? Math.round((weeklyCompleted / weeklyTotal) * 100) : 0;

  const todayCompleted = Object.values(todayLog.habits || {}).filter(Boolean).length;
  const todayPct = allHabits.length > 0 ? Math.round((todayCompleted / allHabits.length) * 100) : 0;
  const allDone = todayCompleted === allHabits.length && allHabits.length > 0;

  // Best streak ever (scan all loaded logs)
  const bestStreak = (() => {
    const dates = Object.keys(habitLogs).sort();
    let best = 0, cur = 0, prev = null;
    for (const d of dates) {
      const log = habitLogs[d];
      const done = Object.values(log.habits || {}).filter(Boolean).length;
      if (done >= 3) {
        if (prev) {
          const prevDate = new Date(prev);
          const curDate = new Date(d);
          const diff = (curDate - prevDate) / (1000 * 60 * 60 * 24);
          cur = diff === 1 ? cur + 1 : 1;
        } else {
          cur = 1;
        }
        if (cur > best) best = cur;
        prev = d;
      } else {
        cur = 0;
        prev = null;
      }
    }
    return Math.max(best, streak);
  })();

  // Monthly calendar data
  const calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const calendarMonthName = calendarMonth.toLocaleString('default', { month: 'long' });
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDayOffset = (calendarMonth.getDay() + 6) % 7; // Monday = 0
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), i + 1);
    const dateStr = formatDate(d);
    const log = habitLogs[dateStr];
    const completed = log ? Object.values(log.habits || {}).filter(Boolean).length : 0;
    const isFuture = d > today;
    return { day: i + 1, dateStr, completed, total: allHabits.length, isFuture, isToday: dateStr === todayStr };
  });

  // Weekly per-habit breakdown
  const perHabitWeekly = allHabits.map(habit => ({
    ...habit,
    days: weekDates.map(date => {
      const dateStr = formatDate(date);
      const log = habitLogs[dateStr];
      return log?.habits?.[habit.key] || false;
    }),
  }));

  // Weekly day success count (how many days had ALL habits done)
  const perfectDays = weeklyStats.filter(d => d.completed === d.total && d.total > 0).length;

  return (
    <PullToRefresh>
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
        {/* ===== Hero: Today's Progress Ring ===== */}
        <div className="cbc-hero anim-fade-up">
          <div className={`cbc-progress-ring${allDone ? ' cbc-ring-complete' : ''}`}>
            <svg viewBox="0 0 200 200">
              <circle className="cbc-arc-track" cx="100" cy="100" r="80" />
              <circle className="cbc-arc-fill" cx="100" cy="100" r="80"
                strokeDasharray={2 * Math.PI * 80}
                strokeDashoffset={2 * Math.PI * 80 - (todayPct / 100) * 2 * Math.PI * 80} />
            </svg>
            <div className="cbc-ring-center">
              <span className="cbc-ring-count">{todayCompleted}<span className="cbc-ring-divider">/</span>{allHabits.length}</span>
              <span className="cbc-ring-label">{allDone ? 'complete' : 'today'}</span>
            </div>
          </div>
          <p className="cbc-hero-tagline">
            {allDone ? 'You showed up for yourself today.' : todayCompleted === 0 ? 'Start your day strong.' : `${allHabits.length - todayCompleted} to go — keep pushing.`}
          </p>
        </div>

        {/* ===== Streak Banner ===== */}
        <div className="cbc-streak-card anim-fade-up-d1">
          <div className="cbc-streak-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <div className="cbc-streak-info">
            <span className="cbc-streak-count">{streak}</span>
            <span className="cbc-streak-label">day streak</span>
          </div>
          <div className="cbc-streak-best">
            <span className="cbc-streak-best-val">{bestStreak}</span>
            <span className="cbc-streak-best-label">best</span>
          </div>
        </div>

        {/* ===== Today's Habits ===== */}
        <div className="cbc-section anim-fade-up-d2">
          <h2 className="cbc-section-title">Today's Habits</h2>
          <div className="cbc-habits-grid">
            {allHabits.map((habit) => {
              const checked = todayLog.habits?.[habit.key] || false;
              const isJustChecked = justChecked === habit.key;
              const isHolding = holdingHabit === habit.key;

              return (
                <div
                  key={habit.key}
                  className={`cbc-habit-tile ${checked ? 'cbc-habit-done' : ''} ${isJustChecked ? 'cbc-habit-just-checked' : ''}`}
                  style={{ '--habit-color': habit.color }}
                >
                  {/* Delete / hide corner button (premium only) */}
                  {isPremium && (
                    <button
                      className="cbc-habit-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(habit.isCustom
                          ? { type: 'custom', id: habit.id, label: habit.label }
                          : { type: 'default', key: habit.key, label: habit.label }
                        );
                      }}
                      aria-label={`Remove ${habit.label}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}

                  {/* Hold-to-complete ring */}
                  <div
                    className={`cbc-habit-ring-touch ${isHolding ? 'cbc-holding' : ''} ${checked ? 'cbc-ring-completed' : ''}`}
                    onPointerDown={(e) => {
                      if (checked) return;
                      e.preventDefault();
                      startHold(habit.key);
                    }}
                    onPointerUp={cancelHold}
                    onPointerLeave={cancelHold}
                    onPointerCancel={cancelHold}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (holdJustCompletedRef.current) {
                        holdJustCompletedRef.current = false;
                        return;
                      }
                      if (checked) undoHabit(habit.key);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={checked ? `Undo ${habit.label}` : `Press and hold to complete ${habit.label}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (checked) { undoHabit(habit.key); }
                        else { completeHabit(habit.key); }
                      }
                    }}
                  >
                    <svg className="cbc-habit-ring-svg" viewBox="0 0 100 100">
                      <circle className="cbc-habit-ring-track" cx="50" cy="50" r={RING_RADIUS} />
                      <circle
                        className="cbc-habit-ring-fill"
                        ref={el => { if (el) ringRefs.current[habit.key] = el; }}
                        cx="50" cy="50" r={RING_RADIUS}
                        style={{
                          stroke: habit.color,
                          strokeDasharray: RING_CIRCUMFERENCE,
                          strokeDashoffset: checked ? 0 : RING_CIRCUMFERENCE,
                        }}
                      />
                    </svg>
                    {checked && (
                      <div className="cbc-habit-glow-orb" style={{ '--habit-color': habit.color }} />
                    )}
                    <div className="cbc-habit-ring-icon" style={{ color: habit.color }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d={habit.icon} />
                      </svg>
                    </div>

                    {isJustChecked && (
                      <div className="cbc-particles">
                        {particlesRef.current.map((p, i) => (
                          <span key={i} className="cbc-particle" style={{
                            '--tx': `${p.tx}px`,
                            '--ty': `${p.ty}px`,
                            '--size': `${p.size}px`,
                            '--particle-color': habit.color,
                            animationDuration: `${p.duration}s`,
                          }} />
                        ))}
                      </div>
                    )}
                  </div>

                  <span className="cbc-habit-label">{habit.label}</span>
                  {checked
                    ? <span className="cbc-habit-done-tag">Done</span>
                    : <span className="cbc-habit-hold-hint">Hold to complete</span>
                  }
                </div>
              );
            })}

            {/* Add Habit Tile (premium) / Unlock Tile (free) */}
            {isPremium ? (
              <div className="cbc-habit-tile cbc-add-tile" onClick={() => setShowAddModal(true)} role="button" tabIndex={0}>
                <div className="cbc-add-ring">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span className="cbc-habit-label">Add Habit</span>
                <span className="cbc-habit-hold-hint">Your own</span>
              </div>
            ) : (
              <div className="cbc-habit-tile cbc-unlock-tile" onClick={() => navigate('/upgrade')} role="button" tabIndex={0}>
                <div className="cbc-unlock-ring">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <span className="cbc-habit-label">More Habits</span>
                <span className="cbc-habit-hold-hint">Custom &amp; editable</span>
              </div>
            )}
          </div>
        </div>

        {/* ===== Weekly Overview — per-habit dot rows ===== */}
        <div className="cbc-section anim-fade-up-d3">
          <div className="cbc-section-header">
            <h2 className="cbc-section-title">This Week</h2>
            <span className="cbc-section-badge">{perfectDays}/7 perfect</span>
          </div>

          <div className="cbc-weekly-card">
            {/* Day headers */}
            <div className="cbc-weekly-header">
              <span className="cbc-weekly-habit-name" />
              {dayLabels.map((label, i) => (
                <span key={i} className={`cbc-weekly-day-label${weekDates[i] && formatDate(weekDates[i]) === todayStr ? ' cbc-today-label' : ''}`}>{label}</span>
              ))}
            </div>

            {/* Per-habit rows */}
            {perHabitWeekly.map((habit) => {
              const doneCount = habit.days.filter(Boolean).length;
              return (
                <div key={habit.key} className="cbc-weekly-row">
                  <span className="cbc-weekly-habit-name" style={{ color: habit.color }}>{habit.label}</span>
                  {habit.days.map((done, i) => (
                    <span
                      key={i}
                      className={`cbc-weekly-dot${done ? ' cbc-dot-done' : ''}${weekDates[i] && formatDate(weekDates[i]) === todayStr ? ' cbc-dot-today' : ''}`}
                      style={done ? { background: habit.color, borderColor: habit.color, boxShadow: `0 0 6px ${habit.color}40` } : undefined}
                    />
                  ))}
                </div>
              );
            })}

            {/* Weekly summary bar */}
            <div className="cbc-week-summary">
              <div className="cbc-week-summary-bar">
                <div className="cbc-week-summary-fill" style={{ width: `${weeklyPct}%` }} />
              </div>
              <span className="cbc-week-summary-text">{weeklyCompleted}/{weeklyTotal} completed ({weeklyPct}%)</span>
            </div>
          </div>
        </div>

        {/* ===== Monthly Calendar Heat-Map ===== */}
        <div className="cbc-section anim-fade-up-d4">
          <h2 className="cbc-section-title">{calendarMonthName}</h2>
          <div className="cbc-calendar-card">
            {/* Weekday headers */}
            <div className="cbc-cal-header">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i} className="cbc-cal-day-label">{d}</span>
              ))}
            </div>
            <div className="cbc-cal-grid">
              {/* Empty cells for offset */}
              {Array.from({ length: firstDayOffset }, (_, i) => (
                <span key={`e${i}`} className="cbc-cal-cell cbc-cal-empty" />
              ))}
              {calendarDays.map((d) => {
                const pct = d.total > 0 ? d.completed / d.total : 0;
                // Heat level: 0=none, 1=low, 2=mid, 3=high, 4=full
                const heat = d.isFuture ? -1 : pct === 0 ? 0 : pct < 0.4 ? 1 : pct < 0.75 ? 2 : pct < 1 ? 3 : 4;
                return (
                  <span
                    key={d.day}
                    className={`cbc-cal-cell${d.isToday ? ' cbc-cal-today' : ''}${heat === 4 ? ' cbc-cal-perfect' : ''} cbc-cal-heat-${heat < 0 ? 'future' : heat}`}
                  >
                    {d.day}
                  </span>
                );
              })}
            </div>
            {/* Legend */}
            <div className="cbc-cal-legend">
              <span className="cbc-cal-legend-label">Less</span>
              <span className="cbc-cal-legend-swatch cbc-cal-heat-0" />
              <span className="cbc-cal-legend-swatch cbc-cal-heat-1" />
              <span className="cbc-cal-legend-swatch cbc-cal-heat-2" />
              <span className="cbc-cal-legend-swatch cbc-cal-heat-3" />
              <span className="cbc-cal-legend-swatch cbc-cal-heat-4" />
              <span className="cbc-cal-legend-label">More</span>
            </div>
          </div>
        </div>
      </main>
      )}

      {/* Core Buddy Bottom Nav */}
      <CoreBuddyNav active="home" />

      {/* Add Habit Modal */}
      {showAddModal && (
        <div className="cbc-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="cbc-modal" onClick={e => e.stopPropagation()}>
            <h3 className="cbc-modal-title">Add Habit</h3>
            <p className="cbc-modal-desc">Track something personal to your routine.</p>
            <input
              className="cbc-modal-input"
              type="text"
              placeholder="e.g. Meditate, Stretch, Read..."
              value={newHabitName}
              onChange={e => setNewHabitName(e.target.value)}
              maxLength={30}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && addCustomHabit()}
            />
            <div className="cbc-modal-actions">
              <button className="cbc-modal-cancel" onClick={() => { setShowAddModal(false); setNewHabitName(''); }}>Cancel</button>
              <button className="cbc-modal-save" onClick={addCustomHabit} disabled={!newHabitName.trim()}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="cbc-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="cbc-modal" onClick={e => e.stopPropagation()}>
            <h3 className="cbc-modal-title">Remove "{deleteConfirm.label}"?</h3>
            <p className="cbc-modal-desc">This will remove the habit from your daily tracker. Past logs won't be affected.</p>
            <div className="cbc-modal-actions">
              <button className="cbc-modal-cancel" onClick={() => setDeleteConfirm(null)}>Keep</button>
              <button className="cbc-modal-delete" onClick={() =>
                deleteConfirm.type === 'custom'
                  ? deleteCustomHabit(deleteConfirm.id)
                  : hideDefaultHabit(deleteConfirm.key)
              }>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Fullscreen Celebration Overlay ===== */}
      {showCelebration && (
        <WorkoutCelebration
          title="All Habits Complete!"
          subtitle={celebrationQuoteRef.current}
          stats={[
            { value: `${todayCompleted}/${allHabits.length}`, label: 'Habits' },
            { value: streak || 1, label: 'Day Streak' },
          ]}
          buttonLabel="Keep Going"
          holdLabel="Hold To Complete Today's Habits"
          shareType="habits"
          hideShare={!isPremium}
          onShareJourney={clientData ? shareToJourney : null}
          userName={clientData?.name}
          onDone={() => { setShowCelebration(false); setCelebrationDismissing(false); }}
        />
      )}

      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
