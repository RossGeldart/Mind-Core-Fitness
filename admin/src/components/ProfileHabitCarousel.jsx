import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import { trackHabitCompleted } from '../utils/analytics';
import '../pages/CoreBuddyConsistency.css';
import './ProfileHabitCarousel.css';

const DEFAULT_HABITS = [
  { key: 'trained', label: 'Trained', icon: 'M4 10v4M8 7v10M8 12h8M16 7v10M20 10v4', color: '#A12F3A', darkColor: '#E8475A' },
  { key: 'protein', label: 'Hit Protein', icon: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zM12 18c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', color: '#4caf50', darkColor: '#5CDB61' },
  { key: 'steps', label: '10k Steps', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 12.5A2.5 2.5 0 0 1 6.5 10H20M4 5.5A2.5 2.5 0 0 1 6.5 3H20', color: '#ff9800', darkColor: '#FFB020' },
  { key: 'sleep', label: '8hrs Sleep', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', color: '#7c3aed', darkColor: '#9B5AF2' },
  { key: 'water', label: '2L Water', icon: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z', color: '#2196f3', darkColor: '#42A5F5' },
];

const CUSTOM_ICON = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';
const CUSTOM_COLORS = [
  { color: '#e91e63', darkColor: '#FF4D88' },
  { color: '#00bcd4', darkColor: '#26D9EC' },
  { color: '#ff5722', darkColor: '#FF7A50' },
  { color: '#009688', darkColor: '#26B8A8' },
  { color: '#ffc107', darkColor: '#FFD54F' },
  { color: '#673ab7', darkColor: '#9575CD' },
  { color: '#8bc34a', darkColor: '#AED581' },
  { color: '#f44336', darkColor: '#EF5350' },
  { color: '#3f51b5', darkColor: '#7986CB' },
  { color: '#795548', darkColor: '#A1887F' },
];

const HOLD_DURATION = 700;
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const MOVE_CANCEL_THRESHOLD = 8; // px — cancel hold if pointer moves this far (user is swiping)

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export default function ProfileHabitCarousel({ onStatsChange }) {
  const { currentUser, clientData } = useAuth();
  const { isDark } = useTheme();
  const { isPremium, FREE_HABIT_LIMIT } = useTier();

  const [habitLogs, setHabitLogs] = useState({});
  const [customHabits, setCustomHabits] = useState([]);
  const [hiddenDefaults, setHiddenDefaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [holdingHabit, setHoldingHabit] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const holdStartRef = useRef(null);
  const rafRef = useRef(null);
  const activeHoldKeyRef = useRef(null);
  const pointerStartRef = useRef(null);
  const ringRefs = useRef({});
  const scrollerRef = useRef(null);

  const today = new Date();
  const todayStr = formatDate(today);

  const resolveColor = (light, dark) => (isDark && dark ? dark : light);
  const allHabits = [
    ...DEFAULT_HABITS.filter(h => !hiddenDefaults.includes(h.key)).map(h => ({
      ...h, color: resolveColor(h.color, h.darkColor),
    })),
    ...customHabits.map((h, i) => {
      const c = CUSTOM_COLORS[i % CUSTOM_COLORS.length];
      return {
        key: `custom_${h.id}`,
        label: h.label,
        icon: CUSTOM_ICON,
        color: resolveColor(c.color, c.darkColor),
        isCustom: true,
      };
    }),
  ];

  const freeHabitLimit = isPremium ? Infinity : FREE_HABIT_LIMIT;
  const visibleHabits = allHabits.slice(0, isPremium ? allHabits.length : freeHabitLimit);

  // Load today's log + custom habits
  useEffect(() => {
    if (!currentUser || !clientData?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const logsRef = collection(db, 'habitLogs');
        const q = query(logsRef, where('clientId', '==', clientData.id), where('date', '==', todayStr));
        const snap = await getDocs(q);
        const logs = {};
        snap.docs.forEach(d => {
          const data = d.data();
          logs[data.date] = { ...data, _id: d.id };
        });

        const customDoc = await getDoc(doc(db, 'customHabits', clientData.id));
        const customData = customDoc.exists() ? customDoc.data() : {};

        if (cancelled) return;
        setHabitLogs(logs);
        setCustomHabits(customData.habits || []);
        setHiddenDefaults(customData.hiddenDefaults || []);
      } catch (err) {
        console.error('Error loading habits for carousel:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, clientData, todayStr]);

  const todayLog = useMemo(() => habitLogs[todayStr] || { habits: {} }, [habitLogs, todayStr]);

  const completeHabit = useCallback(async (habitKey) => {
    if (!currentUser || saving || !clientData?.id) return;
    const wasChecked = todayLog.habits?.[habitKey] || false;
    if (wasChecked) return;

    if (navigator.vibrate) navigator.vibrate(50);

    setSaving(true);
    try {
      const current = todayLog.habits || {};
      const updated = { ...current, [habitKey]: true };
      const docId = todayLog._id || `${clientData.id}_${todayStr}`;

      setHabitLogs(prev => ({
        ...prev,
        [todayStr]: { clientId: clientData.id, date: todayStr, habits: updated, _id: docId },
      }));

      // Notify parent so its stat rings stay in sync
      if (onStatsChange) {
        const completedCount = Object.values(updated).filter(Boolean).length;
        onStatsChange({ completed: completedCount, total: visibleHabits.length });
      }

      await setDoc(doc(db, 'habitLogs', docId), {
        clientId: clientData.id,
        date: todayStr,
        habits: updated,
      });
      trackHabitCompleted(habitKey);
    } catch (err) {
      console.error('Error saving habit from carousel:', err);
      setHabitLogs(prev => ({
        ...prev,
        [todayStr]: { ...prev[todayStr], habits: { ...(prev[todayStr]?.habits || {}), [habitKey]: false } },
      }));
    } finally {
      setSaving(false);
    }
  }, [currentUser, clientData, saving, todayLog, todayStr, onStatsChange, visibleHabits.length]);

  const startHold = (habitKey, clientX, clientY) => {
    const checked = todayLog.habits?.[habitKey] || false;
    if (checked || saving || activeHoldKeyRef.current) return;

    activeHoldKeyRef.current = habitKey;
    pointerStartRef.current = { x: clientX, y: clientY };
    setHoldingHabit(habitKey);
    holdStartRef.current = performance.now();

    const circle = ringRefs.current[habitKey];
    if (circle) circle.style.strokeDashoffset = RING_CIRCUMFERENCE;

    const animate = (now) => {
      const elapsed = now - holdStartRef.current;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);
      const el = ringRefs.current[habitKey];
      if (el) el.style.strokeDashoffset = RING_CIRCUMFERENCE - progress * RING_CIRCUMFERENCE;

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        activeHoldKeyRef.current = null;
        rafRef.current = null;
        setHoldingHabit(null);
        completeHabit(habitKey);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  const cancelHold = () => {
    if (!activeHoldKeyRef.current) return;
    const habitKey = activeHoldKeyRef.current;
    activeHoldKeyRef.current = null;
    pointerStartRef.current = null;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (ringRefs.current[habitKey]) {
      ringRefs.current[habitKey].style.strokeDashoffset = RING_CIRCUMFERENCE;
    }
    setHoldingHabit(null);
    holdStartRef.current = null;
  };

  const handlePointerMove = (e) => {
    if (!activeHoldKeyRef.current || !pointerStartRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_THRESHOLD) cancelHold();
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Track which card is centered for the pagination dots
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = el.querySelectorAll('.phc-card');
      if (!cards.length) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bestDist = Infinity;
      cards.forEach((c, i) => {
        const cardCenter = c.offsetLeft + c.offsetWidth / 2;
        const dist = Math.abs(cardCenter - center);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      setActiveIdx(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [visibleHabits.length]);

  if (loading || !visibleHabits.length) {
    return null;
  }

  return (
    <div className="phc-wrap">
      <div className="phc-header">
        <h3 className="phc-title">Today's Habits</h3>
        <span className="phc-count">
          {Object.values(todayLog.habits || {}).filter(Boolean).length}/{visibleHabits.length}
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="phc-scroller"
        onPointerMove={handlePointerMove}
      >
        {visibleHabits.map((habit) => {
          const checked = todayLog.habits?.[habit.key] || false;
          const isHolding = holdingHabit === habit.key;

          return (
            <div
              key={habit.key}
              className={`phc-card cbc-habit-tile ${checked ? 'cbc-habit-done' : ''}`}
              style={{ '--habit-color': habit.color }}
            >
              <div
                className={`cbc-habit-ring-touch ${isHolding ? 'cbc-holding' : ''} ${checked ? 'cbc-ring-completed' : ''}`}
                onPointerDown={(e) => {
                  if (checked) return;
                  e.preventDefault();
                  startHold(habit.key, e.clientX, e.clientY);
                }}
                onPointerUp={cancelHold}
                onPointerLeave={cancelHold}
                onPointerCancel={cancelHold}
                role="button"
                tabIndex={0}
                aria-label={checked ? `${habit.label} done` : `Press and hold to complete ${habit.label}`}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !checked) {
                    e.preventDefault();
                    completeHabit(habit.key);
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
              </div>

              <span className="cbc-habit-label">{habit.label}</span>
              {checked
                ? <span className="cbc-habit-done-tag">Done</span>
                : <span className="cbc-habit-hold-hint">Hold to complete</span>
              }
            </div>
          );
        })}
      </div>

      {visibleHabits.length > 1 && (
        <div className="phc-dots" role="tablist" aria-label="Habit carousel pagination">
          {visibleHabits.map((h, i) => (
            <span
              key={h.key}
              className={`phc-dot ${i === activeIdx ? 'phc-dot-active' : ''}`}
              aria-label={`Habit ${i + 1} of ${visibleHabits.length}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
