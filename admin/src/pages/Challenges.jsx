import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, addDoc, updateDoc, setDoc, doc, getDoc,
  Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTier } from '../contexts/TierContext';
import { CHALLENGES } from '../config/challengeConfig';
import BADGE_DEFS from '../utils/badgeConfig';
import CoreBuddyNav from '../components/CoreBuddyNav';
import BadgeCelebration from '../components/BadgeCelebration';
import './Challenges.css';

/* ── Icon map ── */
function ChallengeIcon({ icon, size = 28 }) {
  const s = { width: size, height: size };
  switch (icon) {
    case 'flame': return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z"/></svg>;
    case 'crown': return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18"/></svg>;
    case 'fire': return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12c2-2.96 0-7-1-8 0 3.038-1.773 4.741-3 6-1.226 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.532-1.056-3.94-2-5-1.786 3-2.791 3-4 2z"/></svg>;
    case 'clock': return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
    case 'check': return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>;
    case 'shield': return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    default: return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>;
  }
}

/* ── Progress ring ── */
function ProgressRing({ progress, goal, size = 160, stroke = 10, label }) {
  const pct = Math.min(progress / goal, 1);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <div className="ch-ring-wrap">
      <svg width={size} height={size} className="ch-ring-svg">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ch-ring-bg)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-primary)" strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
      </svg>
      <div className="ch-ring-centre">
        <span className="ch-ring-num">{progress}<span className="ch-ring-slash"> / {goal}</span></span>
        {label && <span className="ch-ring-label">{label}</span>}
      </div>
    </div>
  );
}

/* ── Difficulty tag ── */
const DIFF_COLOURS = { easy: '#34C759', medium: '#FF9500', hard: '#FF3B30' };

/* ── Progress computation ── */
async function computeProgress(challenge, clientId, startDate) {
  const start = startDate instanceof Timestamp ? startDate : Timestamp.fromDate(new Date(startDate));
  const startMs = start.toDate().getTime();
  const nowMs = Date.now();

  // Fetch all workout logs for this client, then filter by date in JS.
  // This avoids a composite-index requirement (clientId + completedAt range)
  // that would cause the query to fail silently without the index deployed.
  const fetchWorkoutLogs = async () => {
    const q = query(collection(db, 'workoutLogs'),
      where('clientId', '==', clientId));
    const snap = await getDocs(q);
    return snap.docs.filter(d => {
      const ts = d.data().completedAt;
      if (!ts) return false;
      const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
      return ms >= startMs && ms <= nowMs;
    });
  };

  switch (challenge.type) {
    case 'workouts': {
      const docs = await fetchWorkoutLogs();
      return docs.length;
    }
    case 'minutes': {
      const docs = await fetchWorkoutLogs();
      return docs.reduce((sum, d) => sum + (d.data().duration || 0), 0);
    }
    case 'habits_perfect': {
      const startStr = start.toDate().toISOString().slice(0, 10);
      const todayStr = new Date().toISOString().slice(0, 10);
      const q = query(collection(db, 'habitLogs'),
        where('clientId', '==', clientId));
      const snap = await getDocs(q);
      return snap.docs.filter(d => {
        const date = d.data().date;
        if (date < startStr || date > todayStr) return false;
        const h = d.data().habits || {};
        return Object.values(h).length > 0 && Object.values(h).every(v => v === true);
      }).length;
    }
    case 'streak': {
      const docs = await fetchWorkoutLogs();
      const dates = new Set(docs.map(d =>
        d.data().completedAt.toDate().toISOString().slice(0, 10)));
      let streak = 0;
      const day = new Date(start.toDate());
      const today = new Date();
      while (dates.has(day.toISOString().slice(0, 10)) && day <= today) {
        streak++;
        day.setDate(day.getDate() + 1);
      }
      return streak;
    }
    default:
      return 0;
  }
}

export default function Challenges() {
  const { currentUser, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { isPremium } = useTier();
  const navigate = useNavigate();

  const [activeChallenge, setActiveChallenge] = useState(null);   // userChallenges doc
  const [activeDef, setActiveDef] = useState(null);               // CHALLENGES entry
  const [progress, setProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);         // challenge def or 'giveup'
  const [toast, setToast] = useState(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const [celebration, setCelebration] = useState(null);           // badge def for overlay

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !currentUser) navigate('/');
  }, [authLoading, currentUser, navigate]);

  // Load active challenge + completed count
  const loadData = useCallback(async () => {
    if (!clientData) return;
    setLoading(true);
    try {
      // Active challenge
      const activeQ = query(collection(db, 'userChallenges'),
        where('clientId', '==', clientData.id),
        where('status', '==', 'active'));
      const activeSnap = await getDocs(activeQ);

      if (!activeSnap.empty) {
        const docSnap = activeSnap.docs[0];
        const data = { id: docSnap.id, ...docSnap.data() };
        const def = CHALLENGES.find(c => c.id === data.challengeId);

        // Check if expired
        if (data.endDate.toDate() < new Date()) {
          await updateDoc(doc(db, 'userChallenges', docSnap.id), { status: 'failed' });
          setActiveChallenge(null);
          setActiveDef(null);
          showToast('Challenge expired — time ran out', 'error');
        } else {
          setActiveChallenge(data);
          setActiveDef(def);
          if (def) {
            const prog = await computeProgress(def, clientData.id, data.startDate);
            setProgress(prog);
            // Auto-complete
            if (prog >= def.goal && data.status === 'active') {
              await updateDoc(doc(db, 'userChallenges', docSnap.id), {
                status: 'completed',
                completedAt: serverTimestamp(),
              });
              setJustCompleted(true);
              setActiveChallenge(prev => prev ? { ...prev, status: 'completed' } : null);

              // Award badge if not already earned
              if (!data.badgeAwarded) {
                const badge = BADGE_DEFS.find(b => b.id === def.id);
                if (badge) {
                  try {
                    // Store earned badge in coreBuddyBadges doc
                    const badgeDocRef = doc(db, 'coreBuddyBadges', clientData.id);
                    const badgeSnap = await getDoc(badgeDocRef);
                    const existing = badgeSnap.exists() ? (badgeSnap.data().earned || []) : [];
                    if (!existing.some(b => b.id === badge.id)) {
                      const newBadge = { id: badge.id, earnedAt: new Date().toISOString() };
                      if (badgeSnap.exists()) {
                        await updateDoc(badgeDocRef, { earned: [...existing, newBadge] });
                      } else {
                        await setDoc(badgeDocRef, { earned: [newBadge] });
                      }
                    }
                    // Mark badge awarded on challenge doc
                    await updateDoc(doc(db, 'userChallenges', docSnap.id), { badgeAwarded: true });
                    // Create journey post
                    await addDoc(collection(db, 'posts'), {
                      authorId: clientData.id,
                      authorName: clientData.name || 'Anonymous',
                      authorPhotoURL: clientData.photoURL || null,
                      type: 'badge_earned',
                      metadata: { title: badge.name, badgeDesc: badge.desc, badgeId: badge.id },
                      createdAt: serverTimestamp(),
                      likeCount: 0,
                      commentCount: 0,
                    });
                    // Show celebration overlay
                    setCelebration(badge);
                  } catch (err) {
                    console.error('Badge award failed:', err);
                  }
                }
              }

              if (typeof fbq === 'function') {
                fbq('trackCustom', 'ChallengeCompleted', {
                  challenge_name: def.name,
                  challenge_type: def.type,
                  duration_days: def.duration,
                });
              }
            }
          }
        }
      } else {
        setActiveChallenge(null);
        setActiveDef(null);
      }

      // Completed count (for badges)
      const compQ = query(collection(db, 'userChallenges'),
        where('clientId', '==', clientData.id),
        where('status', '==', 'completed'));
      const compSnap = await getDocs(compQ);
      setCompletedCount(compSnap.size);
    } catch (err) {
      console.error('Failed to load challenges:', err);
    } finally {
      setLoading(false);
    }
  }, [clientData, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Start challenge
  const startChallenge = async (challengeId) => {
    if (!clientData || actionLoading) return;
    setActionLoading(true);
    try {
      const challenge = CHALLENGES.find(c => c.id === challengeId);
      if (!challenge) return;

      // Guard: prevent duplicate active challenges
      const existingQ = query(collection(db, 'userChallenges'),
        where('clientId', '==', clientData.id),
        where('status', '==', 'active'));
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        setConfirmModal(null);
        showToast('You already have an active challenge', 'info');
        await loadData();
        return;
      }

      const now = Timestamp.now();
      const end = Timestamp.fromDate(new Date(Date.now() + challenge.duration * 86400000));
      await addDoc(collection(db, 'userChallenges'), {
        clientId: clientData.id,
        challengeId,
        startDate: now,
        endDate: end,
        status: 'active',
        completedAt: null,
        badgeAwarded: false,
        createdAt: serverTimestamp(),
      });
      setConfirmModal(null);
      showToast(`${challenge.name} started — let's go!`, 'success');
      await loadData();
    } catch (err) {
      console.error('Start challenge failed:', err);
      if (err?.code === 'permission-denied') {
        showToast('Permission denied — please re-login and try again', 'error');
      } else {
        showToast('Something went wrong — try again', 'error');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Give up
  const giveUp = async () => {
    if (!activeChallenge || actionLoading) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'userChallenges', activeChallenge.id), { status: 'failed' });
      setActiveChallenge(null);
      setActiveDef(null);
      setProgress(0);
      setConfirmModal(null);
      showToast('Challenge abandoned', 'info');
      await loadData();
    } catch (err) {
      console.error('Give up failed:', err);
      showToast('Something went wrong', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Days remaining
  const daysLeft = activeChallenge?.endDate
    ? Math.max(0, Math.ceil((activeChallenge.endDate.toDate() - new Date()) / 86400000))
    : 0;

  // Pace label
  const getPaceLabel = () => {
    if (!activeDef || !activeChallenge) return '';
    const elapsed = Math.max(1, Math.ceil((Date.now() - activeChallenge.startDate.toDate()) / 86400000));
    const expectedPace = (activeDef.goal / activeDef.duration) * elapsed;
    if (progress >= expectedPace * 1.15) return 'Ahead';
    if (progress >= expectedPace * 0.85) return 'On Track';
    return 'Behind';
  };

  if (authLoading || !clientData) {
    return <div className="ch-loading"><div className="ch-spinner" /></div>;
  }

  const isActive = activeChallenge && activeChallenge.status === 'active' && activeDef;
  const isCompleted = justCompleted || (activeChallenge && activeChallenge.status === 'completed');

  return (
    <div className="ch-page">
      {/* Header */}
      <header className="client-header">
        <div className="header-content">
          <button className="header-back-btn" onClick={() => navigate('/client/core-buddy')} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <img src="/Logo.webp" alt="Mind Core Fitness" className="header-logo" width="50" height="50" />
          <div className="header-actions">
            <button onClick={toggleTheme} aria-label="Toggle theme">
              {isDark
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
          </div>
        </div>
      </header>

      <main className="ch-main">
        <h1 className="ch-title">Challenges</h1>
        <p className="ch-subtitle">Push yourself with timed fitness challenges</p>

        {loading ? (
          <div className="ch-loading"><div className="ch-spinner" /></div>
        ) : isCompleted ? (
          /* ── State C: Just completed ── */
          (() => {
            const completedBadge = BADGE_DEFS.find(b => b.id === activeDef?.id);
            return (
              <div className="ch-completed-section">
                <div className="ch-completed-badge-wrap">
                  <div className="ch-completed-glow" />
                  {completedBadge?.img ? (
                    <img src={completedBadge.img} alt={completedBadge.name} className="ch-completed-badge-img" />
                  ) : (
                    <ProgressRing progress={activeDef?.goal || 1} goal={activeDef?.goal || 1} label="Complete" />
                  )}
                </div>
                <h2 className="ch-completed-heading">Challenge Complete!</h2>
                <p className="ch-completed-name">{activeDef?.name}</p>
                {completedBadge?.desc && <p className="ch-completed-desc">{completedBadge.desc}</p>}
                <p className="ch-completed-count">{completedCount + (justCompleted ? 1 : 0)} challenge{completedCount !== 0 ? 's' : ''} completed</p>
                <button className="ch-btn ch-btn-primary" onClick={() => { setJustCompleted(false); setActiveChallenge(null); setActiveDef(null); loadData(); }}>
                  Start New Challenge
                </button>
              </div>
            );
          })()
        ) : isActive ? (
          /* ── State B: Active challenge ── */
          <div className="ch-active-section">
            <ProgressRing progress={progress} goal={activeDef.goal}
              label={activeDef.type === 'minutes' ? 'minutes' : activeDef.type === 'streak' ? 'day streak' : activeDef.type === 'habits_perfect' ? 'perfect days' : 'workouts'} />
            <div className="ch-active-info">
              <div className="ch-info-row">
                <div className="ch-info-item">
                  <span className="ch-info-val">{daysLeft}</span>
                  <span className="ch-info-key">days left</span>
                </div>
                <div className={`ch-pace ch-pace-${getPaceLabel().toLowerCase().replace(' ', '')}`}>
                  {getPaceLabel()}
                </div>
              </div>
              <h2 className="ch-active-name">{activeDef.name}</h2>
              <p className="ch-active-desc">{activeDef.description}</p>
            </div>
            <button className="ch-give-up" onClick={() => setConfirmModal('giveup')}>Give Up</button>

            <div className="ch-browse-locked">
              <p className="ch-browse-locked-note">Complete your current challenge to start a new one</p>
              <div className="ch-grid ch-grid-dimmed">
                {CHALLENGES.filter(c => c.id !== activeDef.id).map((c) => (
                  <div className="ch-card ch-card-locked" key={c.id}>
                    <div className="ch-card-icon"><ChallengeIcon icon={c.icon} size={24} /></div>
                    <div className="ch-card-body">
                      <h3>{c.name}</h3>
                      <p>{c.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── State A: Browsing ── */
          <div className="ch-browse-section">
            {!isPremium && (
              <div className="ch-premium-banner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Challenges are a premium feature</span>
                <button className="ch-upgrade-link" onClick={() => navigate('/upgrade')}>Upgrade</button>
              </div>
            )}
            <div className="ch-grid">
              {CHALLENGES.map((c) => (
                <button
                  className={`ch-card${!isPremium ? ' ch-card-gated' : ''}`}
                  key={c.id}
                  onClick={() => isPremium ? setConfirmModal(c) : navigate('/upgrade')}
                >
                  {!isPremium && <div className="ch-lock-overlay"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>}
                  <div className="ch-card-icon"><ChallengeIcon icon={c.icon} /></div>
                  <div className="ch-card-body">
                    <h3>{c.name}</h3>
                    <p>{c.description}</p>
                    <div className="ch-card-tags">
                      <span className="ch-tag ch-tag-dur">{c.duration} days</span>
                      <span className="ch-tag ch-tag-diff" style={{ color: DIFF_COLOURS[c.difficulty] }}>{c.difficulty}</span>
                    </div>
                  </div>
                  <svg className="ch-card-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Confirm modal */}
      {confirmModal && confirmModal !== 'giveup' && (
        <div className="ch-modal-backdrop" onClick={() => !actionLoading && setConfirmModal(null)}>
          <div className="ch-modal" onClick={e => e.stopPropagation()}>
            <div className="ch-modal-icon"><ChallengeIcon icon={confirmModal.icon} size={36} /></div>
            <h2>{confirmModal.name}</h2>
            <p>{confirmModal.description}</p>
            <div className="ch-modal-details">
              <span>{confirmModal.duration} days</span>
              <span style={{ color: DIFF_COLOURS[confirmModal.difficulty] }}>{confirmModal.difficulty}</span>
            </div>
            <button className="ch-btn ch-btn-primary" onClick={() => startChallenge(confirmModal.id)} disabled={actionLoading}>
              {actionLoading ? 'Starting...' : 'Start Challenge'}
            </button>
            <button className="ch-btn ch-btn-secondary" onClick={() => setConfirmModal(null)} disabled={actionLoading}>Cancel</button>
          </div>
        </div>
      )}

      {/* Give up modal */}
      {confirmModal === 'giveup' && (
        <div className="ch-modal-backdrop" onClick={() => !actionLoading && setConfirmModal(null)}>
          <div className="ch-modal" onClick={e => e.stopPropagation()}>
            <h2>Give Up?</h2>
            <p>Your progress will be lost and this challenge will be marked as failed.</p>
            <button className="ch-btn ch-btn-danger" onClick={giveUp} disabled={actionLoading}>
              {actionLoading ? 'Abandoning...' : 'Yes, Give Up'}
            </button>
            <button className="ch-btn ch-btn-secondary" onClick={() => setConfirmModal(null)} disabled={actionLoading}>Keep Going</button>
          </div>
        </div>
      )}

      <BadgeCelebration badge={celebration} onDismiss={() => setCelebration(null)} />

      {/* Toast */}
      {toast && <div className={`ch-toast ch-toast-${toast.type}`}>{toast.message}</div>}

      <CoreBuddyNav />
    </div>
  );
}
