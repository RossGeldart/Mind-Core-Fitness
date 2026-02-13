import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, deleteDoc,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddyProfile.css';

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function pairId(a, b) {
  return [a, b].sort().join('_');
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

function formatDateKey(date) {
  return date.toISOString().split('T')[0];
}

function calculateWeekStreak(workoutDates) {
  if (workoutDates.size === 0) return 0;
  const now = new Date();
  const currentMonday = getMondayOf(now);
  let streak = 0;
  let checkMonday = new Date(currentMonday);

  const currentWeekEnd = new Date(checkMonday);
  currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
  let currentWeekHasWorkout = false;
  workoutDates.forEach(dateStr => {
    const d = new Date(dateStr);
    if (d >= checkMonday && d <= currentWeekEnd) currentWeekHasWorkout = true;
  });
  if (!currentWeekHasWorkout) checkMonday.setDate(checkMonday.getDate() - 7);

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

// Badge definitions (icons only — matching CoreBuddyDashboard)
const BADGE_DEFS = [
  { id: 'first_workout', name: 'First Rep', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/><rect x="3" y="7" width="6" height="10" rx="1"/><rect x="15" y="7" width="6" height="10" rx="1"/></svg> },
  { id: 'workouts_10', name: 'On Fire', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2c1 3 4 5.5 4 8.5a4 4 0 1 1-8 0C8 7.5 11 5 12 2z"/><path d="M12 14v4"/><path d="M10 18h4"/></svg> },
  { id: 'workouts_25', name: 'Lightning', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> },
  { id: 'workouts_50', name: 'Iron Will', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h4"/><path d="M16 12h4"/><path d="M12 4v4"/><path d="M12 16v4"/><circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z"/></svg> },
  { id: 'workouts_100', name: 'Century', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z"/><circle cx="12" cy="12" r="3"/></svg> },
  { id: 'streak_2', name: '2 Wk', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M9 16l2 2 4-4"/></svg> },
  { id: 'streak_4', name: '4 Wk', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 16h8"/><path d="M12 14v4"/></svg> },
  { id: 'streak_8', name: '8 Wk', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2c-1.5 3-5 5-5 9a7 7 0 0 0 14 0c0-4-3.5-6-5-9"/><path d="M12 18c-2 0-3-1.5-3-3 0-2 1.5-3 3-5 1.5 2 3 3 3 5 0 1.5-1 3-3 3z"/></svg> },
  { id: 'programme_done', name: 'Finisher', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 22V8a4 4 0 0 0-4-4H8a4 4 0 0 0 4 4h0a4 4 0 0 0 4-4h2a4 4 0 0 0-4 4v14"/><path d="M9 12l2 2 4-4"/></svg> },
  { id: 'habits_7', name: 'Habits', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg> },
  { id: 'nutrition_7', name: 'Fuel', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a5 5 0 0 1 5 5c0 2-1.5 3.5-3 4.5V20a2 2 0 0 1-4 0v-8.5C8.5 10.5 7 9 7 7a5 5 0 0 1 5-5z"/><path d="M9 7h6"/></svg> },
  { id: 'first_pb', name: 'PB', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6"/><path d="M12 14v8"/><path d="M9 18l3 3 3-3"/><path d="M10 6l2 2 2-2"/></svg> },
  { id: 'pbs_5', name: 'Climb', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18"/><path d="M5 20V10l4-6"/><path d="M9 20V4"/><path d="M13 20V10l4-6"/><path d="M17 20V4"/><path d="M21 20V10"/></svg> },
  { id: 'leaderboard_join', name: 'Social', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

export default function CoreBuddyProfile() {
  const { userId } = useParams();
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ workouts: 0, minutes: 0, streak: 0 });
  const [badges, setBadges] = useState([]);
  const [buddyStatus, setBuddyStatus] = useState('none'); // none | pending_out | pending_in | buddy
  const [requestId, setRequestId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  const isOwnProfile = clientData?.id === userId;

  // Fetch everything
  useEffect(() => {
    if (!clientData || !userId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // 1. Client profile
        const clientsSnap = await getDocs(collection(db, 'clients'));
        const allClients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const target = allClients.find(c => c.id === userId);
        if (!target) { if (!cancelled) setLoading(false); return; }
        if (!cancelled) setProfile(target);

        // 2. Workout stats (all-time)
        const now = new Date();
        const yearAgo = new Date(now);
        yearAgo.setDate(yearAgo.getDate() - 365);
        yearAgo.setHours(0, 0, 0, 0);

        let workouts = 0;
        let minutes = 0;
        const workoutDates = new Set();

        // workoutLogs
        const wlSnap = await getDocs(query(
          collection(db, 'workoutLogs'),
          where('clientId', '==', userId)
        ));
        wlSnap.docs.forEach(d => {
          const data = d.data();
          workouts++;
          minutes += data.duration || 0;
          if (data.completedAt) {
            workoutDates.add(formatDateKey(data.completedAt.toDate()));
          }
        });

        // circuitSessions
        const csSnap = await getDocs(collection(db, 'circuitSessions'));
        csSnap.docs.forEach(d => {
          const data = d.data();
          (data.slots || []).forEach(slot => {
            if (slot.attended && slot.memberId === userId) {
              workouts++;
              minutes += 45;
              workoutDates.add(data.date);
            }
          });
        });

        // 1-2-1 sessions
        const today = formatDateKey(new Date());
        const sessSnap = await getDocs(query(
          collection(db, 'sessions'),
          where('clientId', '==', userId)
        ));
        sessSnap.docs.forEach(d => {
          const data = d.data();
          if (data.date <= today) {
            workouts++;
            minutes += data.duration || 45;
            workoutDates.add(data.date);
          }
        });

        const streak = calculateWeekStreak(workoutDates);
        if (!cancelled) setStats({ workouts, minutes, streak });

        // 3. Achievements
        const achSnap = await getDoc(doc(db, 'coreBuddyAchievements', userId));
        if (!cancelled) setBadges(achSnap.exists() ? (achSnap.data().unlocked || []) : []);

        // 4. Buddy status
        if (!isOwnProfile) {
          const myId = clientData.id;
          const pid = pairId(myId, userId);
          const buddyDoc = await getDoc(doc(db, 'buddies', pid));
          if (buddyDoc.exists()) {
            if (!cancelled) setBuddyStatus('buddy');
          } else {
            // Check outgoing
            const outReqId = `${myId}_${userId}`;
            const outDoc = await getDoc(doc(db, 'buddyRequests', outReqId));
            if (outDoc.exists() && outDoc.data().status === 'pending') {
              if (!cancelled) { setBuddyStatus('pending_out'); setRequestId(outReqId); }
            } else {
              // Check incoming
              const inReqId = `${userId}_${myId}`;
              const inDoc = await getDoc(doc(db, 'buddyRequests', inReqId));
              if (inDoc.exists() && inDoc.data().status === 'pending') {
                if (!cancelled) { setBuddyStatus('pending_in'); setRequestId(inReqId); }
              } else {
                if (!cancelled) setBuddyStatus('none');
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [clientData, userId, isOwnProfile]);

  // Actions
  const sendRequest = async () => {
    setActionLoading(true);
    try {
      const reqId = `${clientData.id}_${userId}`;
      await setDoc(doc(db, 'buddyRequests', reqId), {
        fromId: clientData.id,
        toId: userId,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setBuddyStatus('pending_out');
      setRequestId(reqId);
      showToast('Buddy request sent!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to send request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const acceptRequest = async () => {
    if (!requestId) return;
    setActionLoading(true);
    try {
      const pid = pairId(clientData.id, userId);
      await setDoc(doc(db, 'buddies', pid), {
        user1: [clientData.id, userId].sort()[0],
        user2: [clientData.id, userId].sort()[1],
        connectedAt: serverTimestamp()
      });
      await deleteDoc(doc(db, 'buddyRequests', requestId));
      setBuddyStatus('buddy');
      showToast('Buddy added!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to accept', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const cancelOrDecline = async () => {
    if (!requestId) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'buddyRequests', requestId));
      setBuddyStatus('none');
      showToast(buddyStatus === 'pending_out' ? 'Request cancelled' : 'Request declined', 'info');
    } catch (err) {
      console.error(err);
      showToast('Failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const removeBuddy = async () => {
    setActionLoading(true);
    try {
      const pid = pairId(clientData.id, userId);
      await deleteDoc(doc(db, 'buddies', pid));
      setBuddyStatus('none');
      showToast('Buddy removed', 'info');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading || loading) {
    return <div className="prf-loading"><div className="prf-spinner" /></div>;
  }
  if (!currentUser || !isClient || !clientData) return null;
  if (!profile) {
    return (
      <div className="prf-page" data-theme={isDark ? 'dark' : 'light'}>
        <header className="client-header">
          <div className="header-content">
            <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
            <div className="header-actions" />
          </div>
        </header>
        <main className="prf-main"><p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '40px 0' }}>User not found</p></main>
        <CoreBuddyNav />
      </div>
    );
  }

  return (
    <div className="prf-page" data-theme={isDark ? 'dark' : 'light'}>
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
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

      <main className="prf-main">
        {/* Hero */}
        <div className="prf-hero">
          <div className="prf-avatar-lg">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} />
            ) : (
              <span>{getInitials(profile.name)}</span>
            )}
          </div>
          <h1 className="prf-name">{profile.name}</h1>
          {isOwnProfile && <span className="prf-you-label">You</span>}

          {/* Buddy action */}
          {!isOwnProfile && (
            <div className="prf-buddy-action">
              {buddyStatus === 'none' && (
                <button className="prf-btn prf-btn-primary" onClick={sendRequest} disabled={actionLoading}>
                  {actionLoading ? <div className="prf-btn-spinner" /> : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Buddy
                    </>
                  )}
                </button>
              )}
              {buddyStatus === 'pending_out' && (
                <button className="prf-btn prf-btn-secondary" onClick={cancelOrDecline} disabled={actionLoading}>
                  {actionLoading ? <div className="prf-btn-spinner dark" /> : 'Cancel Request'}
                </button>
              )}
              {buddyStatus === 'pending_in' && (
                <div className="prf-btn-pair">
                  <button className="prf-btn prf-btn-success" onClick={acceptRequest} disabled={actionLoading}>
                    {actionLoading ? <div className="prf-btn-spinner" /> : 'Accept'}
                  </button>
                  <button className="prf-btn prf-btn-secondary" onClick={cancelOrDecline} disabled={actionLoading}>
                    Decline
                  </button>
                </div>
              )}
              {buddyStatus === 'buddy' && (
                <button className="prf-btn prf-btn-danger" onClick={removeBuddy} disabled={actionLoading}>
                  {actionLoading ? <div className="prf-btn-spinner" /> : 'Remove Buddy'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="prf-stats">
          <div className="prf-stat">
            <span className="prf-stat-value">{stats.workouts}</span>
            <span className="prf-stat-label">Workouts</span>
          </div>
          <div className="prf-stat">
            <span className="prf-stat-value">{formatMinutes(stats.minutes)}</span>
            <span className="prf-stat-label">Active Time</span>
          </div>
          <div className="prf-stat">
            <span className="prf-stat-value">{stats.streak}<span className="prf-stat-unit">wk</span></span>
            <span className="prf-stat-label">Streak</span>
          </div>
        </div>

        {/* Achievements */}
        <div className="prf-section">
          <h2 className="prf-section-title">Achievements</h2>
          <div className="prf-badges">
            {BADGE_DEFS.map(b => {
              const unlocked = badges.includes(b.id);
              return (
                <div key={b.id} className={`prf-badge${unlocked ? ' unlocked' : ' locked'}`} title={b.name}>
                  <span className="prf-badge-icon">{b.icon}</span>
                  <span className="prf-badge-name">{b.name}</span>
                </div>
              );
            })}
          </div>
          <p className="prf-badges-count">{badges.length}/{BADGE_DEFS.length} unlocked</p>
        </div>
      </main>

      <CoreBuddyNav />

      {toast && (
        <div className={`toast-notification ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13 L9 17 L19 7" /></svg>
            ) : toast.type === 'error' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="1" fill="currentColor" /></svg>
            )}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
