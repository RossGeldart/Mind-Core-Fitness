import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './CoreBuddyConsistency.css';
import CoreBuddyNav from '../components/CoreBuddyNav';
import PullToRefresh from '../components/PullToRefresh';


const DEFAULT_HABITS = [
  { key: 'trained', label: 'Trained', icon: 'M4 10v4M8 7v10M8 12h8M16 7v10M20 10v4', color: '#A12F3A' },
  { key: 'protein', label: 'Hit Protein', icon: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zM12 18c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', color: '#4caf50' },
  { key: 'steps', label: '10k Steps', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 12.5A2.5 2.5 0 0 1 6.5 10H20M4 5.5A2.5 2.5 0 0 1 6.5 3H20', color: '#ff9800' },
  { key: 'sleep', label: '8hrs Sleep', icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', color: '#7c3aed' },
  { key: 'water', label: '2L Water', icon: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z', color: '#2196f3' },
];

// Icon for custom habits (sparkle)
const CUSTOM_ICON = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';
const CUSTOM_COLOR = '#e91e63';

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
  const [customHabits, setCustomHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [streak, setStreak] = useState(0);
  const [toast, setToast] = useState(null);
  const [justChecked, setJustChecked] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);   // { type: 'custom'|'default', id: string }
  const [hiddenDefaults, setHiddenDefaults] = useState([]);
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

  // Merged habits list (exclude hidden defaults)
  const allHabits = [
    ...DEFAULT_HABITS.filter(h => !hiddenDefaults.includes(h.key)),
    ...customHabits.map(h => ({ key: `custom_${h.id}`, label: h.label, icon: CUSTOM_ICON, color: CUSTOM_COLOR, isCustom: true, id: h.id })),
  ];

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

  const toggleHabit = async (habitKey) => {
    if (!currentUser || saving) return;
    const wasChecked = todayLog.habits?.[habitKey] || false;

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
      if (completedCount === allHabits.length && !wasChecked) {
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
            {allHabits.map((habit) => {
              const checked = todayLog.habits?.[habit.key] || false;
              const isJustChecked = justChecked === habit.key;
              return (
                <button
                  key={habit.key}
                  className={`cbc-habit-btn ${checked ? 'cbc-habit-done' : ''} ${isJustChecked ? 'cbc-habit-just-checked' : ''}`}
                  onClick={() => toggleHabit(habit.key)}
                  disabled={saving}
                  style={{ '--habit-color': habit.color }}
                >
                  <div className="cbc-habit-icon-wrap" style={{ '--habit-color': habit.color }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d={habit.icon} />
                    </svg>
                    {checked && (
                      <div className="cbc-habit-done-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
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
                  <div className="cbc-habit-text">
                    <span className="cbc-habit-label">{habit.label}</span>
                    {checked && <span className="cbc-habit-done-tag">Done</span>}
                  </div>
                  {/* Delete / hide button for all habits */}
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </button>
              );
            })}

            {/* Add Habit Button */}
            <button className="cbc-add-habit-btn" onClick={() => setShowAddModal(true)}>
              <div className="cbc-add-habit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span>Add your own habit</span>
            </button>
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
    </PullToRefresh>
  );
}
