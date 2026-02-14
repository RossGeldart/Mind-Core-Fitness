import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import './Leaderboard.css';
import CoreBuddyNav from '../components/CoreBuddyNav';

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

function getYearBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), 11, 31);
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

function formatVolume(kg) {
  if (kg >= 1000000) return `${(kg / 1000000).toFixed(1)}M kg`;
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`;
  return `${kg} kg`;
}

const TABS = [
  { key: 'workouts', label: 'Workouts', icon: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2.71 7 4.14 8.43 7.71 4.86 16.29 13.43 12.71 17 14.14 18.43 15.57 17 17 18.43 14.14 21.29l1.43 1.43 1.43-1.43 1.43 1.43 2.14-2.14 1.43 1.43L22 20.57z' },
  { key: 'minutes', label: 'Minutes', icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z' },
  { key: 'volume', label: 'Volume', icon: 'M6.5 2H4v20h2.5M17.5 2H20v20h-2.5M4 12h16M7 7h10M7 17h10' },
  { key: 'streak', label: 'Streak', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
];

const MEDAL_COLORS = ['#FFD700', '#A8B4C0', '#CD7F32'];

const TAB_DESCRIPTIONS = {
  workouts: 'Total completed workouts across randomiser, muscle group and programme sessions',
  minutes: 'Active minutes from randomiser workouts only',
  volume: 'Total weight lifted (kg) from programme and muscle group workouts',
  streak: 'Consecutive weeks with at least one workout completed (Mon\u2013Sun)',
};

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('workouts');
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState([]);
  const [optedIn, setOptedIn] = useState(null);
  const [togglingOptIn, setTogglingOptIn] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [toast, setToast] = useState(null);
  const [buddyFilter, setBuddyFilter] = useState(false);
  const [buddyIds, setBuddyIds] = useState(new Set());
  const [showAll, setShowAll] = useState(false);

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

  // Fetch buddy IDs for filter
  useEffect(() => {
    if (!clientData) return;
    (async () => {
      try {
        const myId = clientData.id;
        const b1 = await getDocs(query(collection(db, 'buddies'), where('user1', '==', myId)));
        const b2 = await getDocs(query(collection(db, 'buddies'), where('user2', '==', myId)));
        const ids = new Set();
        [...b1.docs, ...b2.docs].forEach(d => {
          const data = d.data();
          ids.add(data.user1 === myId ? data.user2 : data.user1);
        });
        setBuddyIds(ids);
      } catch (err) {
        console.error('Error fetching buddies:', err);
      }
    })();
  }, [clientData]);

  useEffect(() => {
    if (!clientData || !optedIn) return;
    setShowAll(false);
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
      // Get all opted-in Core Buddy clients only
      const clientsQ = query(collection(db, 'clients'), where('leaderboardOptIn', '==', true));
      const clientsSnap = await getDocs(clientsQ);
      const clients = clientsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.clientType === 'core_buddy' || c.coreBuddyAccess === true);

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
        bounds = period === 'week' ? getWeekBounds() : period === 'month' ? getMonthBounds() : getYearBounds();
      }

      const startTs = Timestamp.fromDate(bounds.start);
      const endTs = Timestamp.fromDate(bounds.end);

      // Query workoutLogs (Core Buddy workouts only)
      const wlQ = query(
        collection(db, 'workoutLogs'),
        where('completedAt', '>=', startTs),
        where('completedAt', '<=', endTs)
      );
      const wlSnap = await getDocs(wlQ);

      // Build stats map
      const clientIds = new Set(clients.map(c => c.id));
      const stats = {};
      clients.forEach(c => {
        stats[c.id] = {
          id: c.id,
          name: c.name,
          photoURL: c.photoURL || null,
          workouts: 0,
          minutes: 0,
          volume: 0,
          workoutDates: new Set(),
        };
      });

      // Process workoutLogs
      wlSnap.docs.forEach(d => {
        const data = d.data();
        if (!clientIds.has(data.clientId)) return;
        const s = stats[data.clientId];

        // Workouts: count all types (randomiser, muscle_group, programme)
        s.workouts++;

        // Minutes: only randomiser workouts (no type field = randomiser)
        if (!data.type) {
          s.minutes += data.duration || 0;
        }

        // Volume: programme + muscle_group only
        if (data.type === 'programme' || data.type === 'muscle_group') {
          s.volume += data.volume || 0;
        }

        // Streak dates: all workout types count
        if (data.completedAt) {
          const date = data.completedAt.toDate();
          s.workoutDates.add(formatDateKey(date));
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
      } else if (activeTab === 'volume') {
        sorted.sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name));
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
    if (activeTab === 'volume') return entry.volume;
    return entry.streak;
  };

  const formatValue = (entry) => {
    if (activeTab === 'workouts') return entry.workouts;
    if (activeTab === 'minutes') return formatMinutes(entry.minutes);
    if (activeTab === 'volume') return formatVolume(entry.volume);
    return entry.streak;
  };

  const getUnit = () => {
    if (activeTab === 'workouts') return '';
    if (activeTab === 'minutes') return '';
    if (activeTab === 'volume') return '';
    return 'wk';
  };

  const getPeriodLabel = () => {
    if (activeTab === 'streak') return 'All Time';
    if (period === 'week') {
      const { start, end } = getWeekBounds();
      return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    }
    if (period === 'year') {
      return new Date().getFullYear().toString();
    }
    const now = new Date();
    return now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  };

  // Apply buddy filter
  const filteredRankings = buddyFilter
    ? rankings.filter(r => buddyIds.has(r.id) || r.id === clientData?.id)
        .map((r, i) => ({ ...r, rank: i + 1 }))
    : rankings;

  const podiumEntries = filteredRankings.slice(0, 3);
  const remainingEntries = filteredRankings.slice(3);
  const listEntries = showAll ? remainingEntries : remainingEntries.slice(0, 7);
  const hasMore = remainingEntries.length > 7;

  const isCurrentUser = (entry) => entry.id === clientData?.id;
  const currentUserEntry = filteredRankings.find(r => r.id === clientData?.id);

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
                      {tab.key === 'workouts' && 'Randomiser, muscle group & programme workouts'}
                      {tab.key === 'minutes' && 'Total minutes from randomiser workouts'}
                      {tab.key === 'volume' && 'Total weight lifted in programmes & muscle groups'}
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
        <CoreBuddyNav />
      </div>
    );
  }

  return (
    <div className="lb-page" data-theme={isDark ? 'dark' : 'light'}>
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Go back">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
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

        {/* Tab Description */}
        <div className="lb-tab-desc">{TAB_DESCRIPTIONS[activeTab]}</div>

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
              <button
                className={`lb-period-btn ${period === 'year' ? 'lb-period-active' : ''}`}
                onClick={() => setPeriod('year')}
              >
                This Year
              </button>
            </div>
          </div>
        )}

        {/* Buddy Filter */}
        {buddyIds.size > 0 && (
          <div className="lb-buddy-filter-row">
            <button
              className={`lb-buddy-filter${buddyFilter ? ' active' : ''}`}
              onClick={() => setBuddyFilter(!buddyFilter)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Buddies Only</span>
            </button>
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
                <div className="lb-podium-place lb-podium-2nd" onClick={() => podiumEntries[1] && navigate(`/client/core-buddy/profile/${podiumEntries[1].id}`)} role={podiumEntries[1] ? 'button' : undefined}>
                  {podiumEntries[1] ? (
                    <>
                      <div className={`lb-podium-avatar ${isCurrentUser(podiumEntries[1]) ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[1] }}>
                        {podiumEntries[1].photoURL ? <img src={podiumEntries[1].photoURL} alt="" className="lb-avatar-img" /> : getInitials(podiumEntries[1].name)}
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
                <div className="lb-podium-place lb-podium-1st" onClick={() => navigate(`/client/core-buddy/profile/${podiumEntries[0].id}`)} role="button">
                  <div className="lb-podium-crown">
                    <svg viewBox="0 0 24 24" fill="#FFD700" stroke="none">
                      <path d="M2.5 18.5l3-7 4 4 3-9 3 9 4-4 3 7z"/>
                      <rect x="3" y="18" width="18" height="2" rx="1"/>
                    </svg>
                  </div>
                  <div className={`lb-podium-avatar lb-avatar-1st ${isCurrentUser(podiumEntries[0]) ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[0] }}>
                    {podiumEntries[0].photoURL ? <img src={podiumEntries[0].photoURL} alt="" className="lb-avatar-img" /> : getInitials(podiumEntries[0].name)}
                  </div>
                  <div className="lb-podium-name">{podiumEntries[0].name.split(' ')[0]}</div>
                  <div className="lb-podium-stat">{formatValue(podiumEntries[0])}</div>
                  <div className="lb-podium-bar lb-bar-1st">
                    <span className="lb-podium-rank">1</span>
                  </div>
                </div>

                {/* 3rd place */}
                <div className="lb-podium-place lb-podium-3rd" onClick={() => podiumEntries[2] && navigate(`/client/core-buddy/profile/${podiumEntries[2].id}`)} role={podiumEntries[2] ? 'button' : undefined}>
                  {podiumEntries[2] ? (
                    <>
                      <div className={`lb-podium-avatar ${isCurrentUser(podiumEntries[2]) ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[2] }}>
                        {podiumEntries[2].photoURL ? <img src={podiumEntries[2].photoURL} alt="" className="lb-avatar-img" /> : getInitials(podiumEntries[2].name)}
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
                    onClick={() => navigate(`/client/core-buddy/profile/${entry.id}`)}
                    role="button"
                  >
                    <span className="lb-rank-number">{entry.rank}</span>
                    <div className={`lb-rank-avatar ${isCurrentUser(entry) ? 'lb-avatar-you' : ''}`}>
                      {entry.photoURL ? <img src={entry.photoURL} alt="" className="lb-avatar-img" /> : getInitials(entry.name)}
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
                {hasMore && (
                  <button className="lb-view-all-btn" onClick={() => setShowAll(!showAll)}>
                    <span>{showAll ? 'Show Less' : `View All (${filteredRankings.length})`}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showAll ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>
                )}
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

      {/* Core Buddy Bottom Nav */}
      <CoreBuddyNav />

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
