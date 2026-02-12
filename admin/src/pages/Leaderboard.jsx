import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './Leaderboard.css';

function getWeekBounds() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function getMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatDateKey(date) {
  return date.toISOString().split('T')[0];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateWeekStreak(workoutDates) {
  if (workoutDates.size === 0) return 0;

  const now = new Date();
  const currentMonday = getMondayOf(now);
  let streak = 0;
  let checkMonday = new Date(currentMonday);

  // Check if current week has a workout
  const currentWeekEnd = new Date(checkMonday);
  currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
  let currentWeekHasWorkout = false;
  workoutDates.forEach(dateStr => {
    const d = new Date(dateStr);
    if (d >= checkMonday && d <= currentWeekEnd) currentWeekHasWorkout = true;
  });

  // If current week has no workouts yet, skip it (don't break streak)
  if (!currentWeekHasWorkout) {
    checkMonday.setDate(checkMonday.getDate() - 7);
  }

  // Count consecutive weeks going backwards
  for (let i = 0; i < 52; i++) {
    const weekStart = new Date(checkMonday);
    const weekEnd = new Date(checkMonday);
    weekEnd.setDate(weekEnd.getDate() + 6);

    let hasWorkout = false;
    workoutDates.forEach(dateStr => {
      const d = new Date(dateStr);
      if (d >= weekStart && d <= weekEnd) hasWorkout = true;
    });

    if (hasWorkout) {
      streak++;
      checkMonday.setDate(checkMonday.getDate() - 7);
    } else {
      break;
    }
  }

  return streak;
}

const TABS = [
  { key: 'workouts', label: 'Workouts', icon: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2.71 7 4.14 8.43 7.71 4.86 16.29 13.43 12.71 17 14.14 18.43 15.57 17 17 18.43 14.14 21.29l1.43 1.43 1.43-1.43 1.43 1.43 2.14-2.14 1.43 1.43L22 20.57z' },
  { key: 'minutes', label: 'Minutes', icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z' },
  { key: 'streak', label: 'Streak', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
];

const MEDAL_COLORS = ['#FFD700', '#A8B4C0', '#CD7F32'];

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('workouts');
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState([]);
  const [optedIn, setOptedIn] = useState(null);
  const [togglingOptIn, setTogglingOptIn] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [toast, setToast] = useState(null);

  const { currentUser, isClient, clientData, updateClientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  useEffect(() => {
    if (clientData) {
      setOptedIn(clientData.leaderboardOptIn === true);
    }
  }, [clientData]);

  useEffect(() => {
    if (!clientData || !optedIn) return;
    fetchLeaderboard();
  }, [clientData, optedIn, activeTab, period]);

  const handleOptIn = async () => {
    setTogglingOptIn(true);
    try {
      await updateDoc(doc(db, 'clients', clientData.id), { leaderboardOptIn: true });
      updateClientData({ leaderboardOptIn: true });
      setOptedIn(true);
      showToast('You\'re on the leaderboard!', 'success');
    } catch (err) {
      console.error('Error opting in:', err);
      showToast('Failed to join. Try again.', 'error');
    } finally {
      setTogglingOptIn(false);
    }
  };

  const handleOptOut = async () => {
    setTogglingOptIn(true);
    setShowLeaveModal(false);
    try {
      await updateDoc(doc(db, 'clients', clientData.id), { leaderboardOptIn: false });
      updateClientData({ leaderboardOptIn: false });
      setOptedIn(false);
      setRankings([]);
      showToast('You\'ve left the leaderboard', 'info');
    } catch (err) {
      console.error('Error opting out:', err);
      showToast('Failed to leave. Try again.', 'error');
    } finally {
      setTogglingOptIn(false);
    }
  };

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      // Get all opted-in clients
      const clientsQ = query(collection(db, 'clients'), where('leaderboardOptIn', '==', true));
      const clientsSnap = await getDocs(clientsQ);
      const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (clients.length === 0) {
        setRankings([]);
        setLoading(false);
        return;
      }

      // Determine date range
      let bounds;
      if (activeTab === 'streak') {
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - 365);
        start.setHours(0, 0, 0, 0);
        bounds = { start, end: now };
      } else {
        bounds = period === 'week' ? getWeekBounds() : getMonthBounds();
      }

      const startStr = formatDateKey(bounds.start);
      const endStr = formatDateKey(bounds.end);
      const startTs = Timestamp.fromDate(bounds.start);
      const endTs = Timestamp.fromDate(bounds.end);

      // Query workoutLogs
      const wlQ = query(
        collection(db, 'workoutLogs'),
        where('completedAt', '>=', startTs),
        where('completedAt', '<=', endTs)
      );
      const wlSnap = await getDocs(wlQ);

      // Query circuitSessions
      const csQ = query(
        collection(db, 'circuitSessions'),
        where('date', '>=', startStr),
        where('date', '<=', endStr)
      );
      const csSnap = await getDocs(csQ);

      // Query 1-2-1 sessions
      const sessQ = query(
        collection(db, 'sessions'),
        where('date', '>=', startStr),
        where('date', '<=', endStr)
      );
      const sessSnap = await getDocs(sessQ);

      // Build stats map
      const clientIds = new Set(clients.map(c => c.id));
      const stats = {};
      clients.forEach(c => {
        stats[c.id] = {
          id: c.id,
          name: c.name,
          workouts: 0,
          minutes: 0,
          workoutDates: new Set(),
        };
      });

      // Process workoutLogs
      wlSnap.docs.forEach(d => {
        const data = d.data();
        if (!clientIds.has(data.clientId)) return;
        stats[data.clientId].workouts++;
        stats[data.clientId].minutes += data.duration || 0;
        if (data.completedAt) {
          const date = data.completedAt.toDate();
          stats[data.clientId].workoutDates.add(formatDateKey(date));
        }
      });

      // Process circuitSessions (check attended slots)
      csSnap.docs.forEach(d => {
        const data = d.data();
        (data.slots || []).forEach(slot => {
          if (slot.attended && slot.memberId && clientIds.has(slot.memberId)) {
            stats[slot.memberId].workouts++;
            stats[slot.memberId].minutes += 45;
            stats[slot.memberId].workoutDates.add(data.date);
          }
        });
      });

      // Process 1-2-1 sessions (past = completed)
      const today = formatDateKey(new Date());
      sessSnap.docs.forEach(d => {
        const data = d.data();
        if (!clientIds.has(data.clientId)) return;
        if (data.date <= today) {
          stats[data.clientId].workouts++;
          stats[data.clientId].minutes += data.duration || 45;
          stats[data.clientId].workoutDates.add(data.date);
        }
      });

      // Calculate streaks
      if (activeTab === 'streak') {
        Object.values(stats).forEach(s => {
          s.streak = calculateWeekStreak(s.workoutDates);
        });
      }

      // Sort
      let sorted = Object.values(stats);
      if (activeTab === 'workouts') {
        sorted.sort((a, b) => b.workouts - a.workouts || a.name.localeCompare(b.name));
      } else if (activeTab === 'minutes') {
        sorted.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
      } else {
        sorted.sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name));
      }

      sorted.forEach((s, i) => { s.rank = i + 1; });
      setRankings(sorted);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      showToast('Failed to load leaderboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getValue = (entry) => {
    if (activeTab === 'workouts') return entry.workouts;
    if (activeTab === 'minutes') return entry.minutes;
    return entry.streak;
  };

  const formatValue = (entry) => {
    if (activeTab === 'workouts') return entry.workouts;
    if (activeTab === 'minutes') return formatMinutes(entry.minutes);
    return entry.streak;
  };

  const getUnit = () => {
    if (activeTab === 'workouts') return '';
    if (activeTab === 'minutes') return '';
    return 'wk';
  };

  const getPeriodLabel = () => {
    if (activeTab === 'streak') return 'All Time';
    if (period === 'week') {
      const { start, end } = getWeekBounds();
      return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    }
    const now = new Date();
    return now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  const isCurrentUser = (entry) => entry.id === clientData?.id;
  const currentUserEntry = rankings.find(r => r.id === clientData?.id);

  if (authLoading) {
    return (
      <div className="lb-loading">
        <div className="lb-loading-spinner" />
      </div>
    );
  }

  if (!currentUser || !isClient || !clientData) return null;

  // Opt-in screen
  if (optedIn === false) {
    return (
      <div className="lb-page" data-theme={isDark ? 'dark' : 'light'}>
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
            </div>
          </div>
        </header>

        <main className="lb-optin-main">
          <div className="lb-optin-card">
            <div className="lb-optin-trophy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                <path d="M4 22h16"/>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
              </svg>
            </div>
            <h2 className="lb-optin-title">Join the Leaderboard</h2>
            <p className="lb-optin-desc">Compete with other Mind Core Fitness members</p>

            <div className="lb-optin-categories">
              {TABS.map(tab => (
                <div key={tab.key} className="lb-optin-category">
                  <div className="lb-optin-category-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={tab.icon}/></svg>
                  </div>
                  <div className="lb-optin-category-text">
                    <span className="lb-optin-category-name">{tab.label}</span>
                    <span className="lb-optin-category-desc">
                      {tab.key === 'workouts' && 'Total workouts from all training types'}
                      {tab.key === 'minutes' && 'Total active minutes across all sessions'}
                      {tab.key === 'streak' && 'Consecutive weeks with at least one workout'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="lb-optin-btn"
              onClick={handleOptIn}
              disabled={togglingOptIn}
            >
              {togglingOptIn ? 'Joining...' : 'Join the Leaderboard'}
            </button>
            <p className="lb-optin-note">Your full name will be visible to other members</p>
          </div>
        </main>
      </div>
    );
  }

  const podiumEntries = rankings.slice(0, 3);
  const listEntries = rankings.slice(3);

  return (
    <div className="lb-page" data-theme={isDark ? 'dark' : 'light'}>
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.PNG" alt="Mind Core Fitness" className="header-logo" />
          <div className="header-actions">
            <button onClick={() => setShowLeaveModal(true)} aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          </div>
        </div>
      </header>

      <main className="lb-main">
        {/* Tab Switcher */}
        <div className="lb-tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`lb-tab ${activeTab === tab.key ? 'lb-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={tab.icon}/></svg>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Period Toggle */}
        {activeTab !== 'streak' && (
          <div className="lb-period-row">
            <div className="lb-period-toggle">
              <button
                className={`lb-period-btn ${period === 'week' ? 'lb-period-active' : ''}`}
                onClick={() => setPeriod('week')}
              >
                This Week
              </button>
              <button
                className={`lb-period-btn ${period === 'month' ? 'lb-period-active' : ''}`}
                onClick={() => setPeriod('month')}
              >
                This Month
              </button>
            </div>
          </div>
        )}

        <div className="lb-period-label">{getPeriodLabel()}</div>

        {loading ? (
          <div className="lb-content-loading">
            <div className="lb-loading-spinner" />
          </div>
        ) : rankings.length === 0 ? (
          <div className="lb-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="lb-empty-icon">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
              <path d="M4 22h16"/>
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
            </svg>
            <h3>No one here yet</h3>
            <p>Be the first to get a workout in!</p>
          </div>
        ) : (
          <>
            {/* Podium */}
            {podiumEntries.length > 0 && (
              <div className="lb-podium">
                {/* 2nd place */}
                <div className="lb-podium-place lb-podium-2nd">
                  {podiumEntries[1] ? (
                    <>
                      <div className={`lb-podium-avatar ${isCurrentUser(podiumEntries[1]) ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[1] }}>
                        {getInitials(podiumEntries[1].name)}
                      </div>
                      <div className="lb-podium-name">{podiumEntries[1].name.split(' ')[0]}</div>
                      <div className="lb-podium-stat">{formatValue(podiumEntries[1])}</div>
                      <div className="lb-podium-bar lb-bar-2nd">
                        <span className="lb-podium-rank">2</span>
                      </div>
                    </>
                  ) : <div className="lb-podium-spacer" />}
                </div>

                {/* 1st place */}
                <div className="lb-podium-place lb-podium-1st">
                  <div className="lb-podium-crown">
                    <svg viewBox="0 0 24 24" fill="#FFD700" stroke="none">
                      <path d="M2.5 18.5l3-7 4 4 3-9 3 9 4-4 3 7z"/>
                      <rect x="3" y="18" width="18" height="2" rx="1"/>
                    </svg>
                  </div>
                  <div className={`lb-podium-avatar lb-avatar-1st ${isCurrentUser(podiumEntries[0]) ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[0] }}>
                    {getInitials(podiumEntries[0].name)}
                  </div>
                  <div className="lb-podium-name">{podiumEntries[0].name.split(' ')[0]}</div>
                  <div className="lb-podium-stat">{formatValue(podiumEntries[0])}</div>
                  <div className="lb-podium-bar lb-bar-1st">
                    <span className="lb-podium-rank">1</span>
                  </div>
                </div>

                {/* 3rd place */}
                <div className="lb-podium-place lb-podium-3rd">
                  {podiumEntries[2] ? (
                    <>
                      <div className={`lb-podium-avatar ${isCurrentUser(podiumEntries[2]) ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[2] }}>
                        {getInitials(podiumEntries[2].name)}
                      </div>
                      <div className="lb-podium-name">{podiumEntries[2].name.split(' ')[0]}</div>
                      <div className="lb-podium-stat">{formatValue(podiumEntries[2])}</div>
                      <div className="lb-podium-bar lb-bar-3rd">
                        <span className="lb-podium-rank">3</span>
                      </div>
                    </>
                  ) : <div className="lb-podium-spacer" />}
                </div>
              </div>
            )}

            {/* Rankings List */}
            {listEntries.length > 0 && (
              <div className="lb-rankings">
                {listEntries.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`lb-rank-item ${isCurrentUser(entry) ? 'lb-rank-you' : ''}`}
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <span className="lb-rank-number">{entry.rank}</span>
                    <div className={`lb-rank-avatar ${isCurrentUser(entry) ? 'lb-avatar-you' : ''}`}>
                      {getInitials(entry.name)}
                    </div>
                    <div className="lb-rank-info">
                      <span className="lb-rank-name">
                        {entry.name}
                        {isCurrentUser(entry) && <span className="lb-you-badge">You</span>}
                      </span>
                    </div>
                    <span className="lb-rank-stat">{formatValue(entry)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Your position sticky bar (if you're below position 5) */}
            {currentUserEntry && currentUserEntry.rank > 5 && (
              <div className="lb-your-position">
                <span className="lb-your-rank">#{currentUserEntry.rank}</span>
                <span className="lb-your-label">Your Position</span>
                <span className="lb-your-stat">{formatValue(currentUserEntry)}</span>
              </div>
            )}
          </>
        )}
      </main>

      {/* Leave Modal */}
      {showLeaveModal && (
        <div className="lb-modal-overlay" onClick={() => setShowLeaveModal(false)}>
          <div className="lb-modal" onClick={e => e.stopPropagation()}>
            <h3>Leave the Leaderboard?</h3>
            <p>Your name will no longer appear to other members. You can rejoin anytime.</p>
            <div className="lb-modal-actions">
              <button className="lb-modal-cancel" onClick={() => setShowLeaveModal(false)}>Stay</button>
              <button className="lb-modal-confirm" onClick={handleOptOut} disabled={togglingOptIn}>
                {togglingOptIn ? 'Leaving...' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13 L9 17 L19 7" />
              </svg>
            ) : toast.type === 'error' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
