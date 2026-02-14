import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, deleteDoc,
  addDoc, updateDoc, orderBy, limit, increment, serverTimestamp, Timestamp
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

const HABIT_COUNT = 5;

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatVolume(kg) {
  if (kg >= 1000000) return `${(kg / 1000000).toFixed(1)}M`;
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`;
  return `${Math.round(kg)}`;
}

function formatVolumeUnit(kg) {
  if (kg >= 1000000) return 'million kg';
  if (kg >= 1000) return 'tonnes';
  return 'kg';
}

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

function timeAgo(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
  const diff = Math.floor((new Date() - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CoreBuddyProfile() {
  const { userId } = useParams();
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [buddyStatus, setBuddyStatus] = useState('none'); // none | pending_out | pending_in | buddy
  const [requestId, setRequestId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Journey state
  const [journeyPosts, setJourneyPosts] = useState([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentLoading, setCommentLoading] = useState({});

  // Stats state
  const [statsLoading, setStatsLoading] = useState(true);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [habitStreak, setHabitStreak] = useState(0);
  const [topPBs, setTopPBs] = useState([]);
  const [unlockedBadges, setUnlockedBadges] = useState([]);
  const [programmeName, setProgrammeName] = useState(null);
  const [programmePct, setProgrammePct] = useState(0);

  // @ Mention state
  const [allClients, setAllClients] = useState([]);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionTarget, setMentionTarget] = useState(null); // postId
  const [mentionResults, setMentionResults] = useState([]);

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Redirect own profile to dashboard
  useEffect(() => {
    if (clientData && userId && clientData.id === userId) {
      navigate('/client/core-buddy', { replace: true });
    }
  }, [clientData, userId, navigate]);

  // Fetch everything
  useEffect(() => {
    if (!clientData || !userId) return;
    if (clientData.id === userId) return; // own profile redirects
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

        // 2. Buddy status
        const myId = clientData.id;
        const pid = pairId(myId, userId);
        const buddyDoc = await getDoc(doc(db, 'buddies', pid));
        if (buddyDoc.exists()) {
          if (!cancelled) setBuddyStatus('buddy');
        } else {
          const outReqId = `${myId}_${userId}`;
          const outDoc = await getDoc(doc(db, 'buddyRequests', outReqId));
          if (outDoc.exists() && outDoc.data().status === 'pending') {
            if (!cancelled) { setBuddyStatus('pending_out'); setRequestId(outReqId); }
          } else {
            const inReqId = `${userId}_${myId}`;
            const inDoc = await getDoc(doc(db, 'buddyRequests', inReqId));
            if (inDoc.exists() && inDoc.data().status === 'pending') {
              if (!cancelled) { setBuddyStatus('pending_in'); setRequestId(inReqId); }
            } else {
              if (!cancelled) setBuddyStatus('none');
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
  }, [clientData, userId]);

  // Fetch buddy stats
  useEffect(() => {
    if (!userId || !profile) return;
    let cancelled = false;

    (async () => {
      setStatsLoading(true);
      try {
        // Parallel fetches
        const [logsSnap, achSnap, pbSnap, progSnap] = await Promise.all([
          getDocs(query(collection(db, 'workoutLogs'), where('clientId', '==', userId))),
          getDoc(doc(db, 'coreBuddyAchievements', userId)),
          getDoc(doc(db, 'coreBuddyPBs', userId)),
          getDoc(doc(db, 'clientProgrammes', userId)),
        ]);

        if (cancelled) return;

        // Total workouts
        const totalAll = logsSnap.docs.length;
        setTotalWorkouts(totalAll);

        // Total volume
        if (achSnap.exists()) {
          setTotalVolume(achSnap.data().totalVolume || 0);
        }

        // Workout streak (consecutive weeks)
        let wkStreak = 0;
        const allDates = logsSnap.docs.map(d => d.data().date).filter(Boolean).sort().reverse();
        if (allDates.length > 0) {
          const now2 = new Date();
          let checkWeek = new Date(now2);
          for (let w = 0; w < 52; w++) {
            const weekStart = new Date(checkWeek);
            const dow = weekStart.getDay();
            const monOff = dow === 0 ? 6 : dow - 1;
            weekStart.setDate(weekStart.getDate() - monOff);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);
            const wsStr = formatDate(weekStart);
            const weStr = formatDate(weekEnd);
            const hasWorkout = allDates.some(d => d >= wsStr && d < weStr);
            if (hasWorkout) { wkStreak++; }
            else if (w > 0) break;
            else break;
            checkWeek.setDate(checkWeek.getDate() - 7);
          }
        }
        if (!cancelled) setStreakWeeks(wkStreak);

        // Personal bests (top 3)
        if (pbSnap.exists()) {
          const exercises = pbSnap.data().exercises || {};
          const pbList = Object.entries(exercises)
            .sort(([, a], [, b]) => (b.weight || 0) - (a.weight || 0))
            .slice(0, 3)
            .map(([name, data]) => ({ name, weight: data.weight, reps: data.reps }));
          if (!cancelled) setTopPBs(pbList);
        }

        // Programme progress
        if (progSnap.exists()) {
          const prog = progSnap.data();
          const meta = TEMPLATE_META[prog.templateId];
          if (meta) {
            const completedCount = Object.keys(prog.completedSessions || {}).length;
            const total = meta.duration * meta.daysPerWeek;
            if (!cancelled) {
              setProgrammeName(prog.templateId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
              setProgrammePct(total > 0 ? Math.round((completedCount / total) * 100) : 0);
            }
          }
        }

        // Badges from achievements collection
        const achBadgesSnap = await getDoc(doc(db, 'achievements', userId));
        if (!cancelled && achBadgesSnap.exists()) {
          const badges = achBadgesSnap.data().badges || {};
          setUnlockedBadges(Object.keys(badges));
        }

        // Habit streak (consecutive days with all 5 done)
        let hStreak = 0;
        for (let d = 0; d < 30; d++) {
          const checkDate = new Date();
          checkDate.setDate(checkDate.getDate() - d);
          const dStr = formatDate(checkDate);
          try {
            const hSnap = await getDocs(query(collection(db, 'habitLogs'), where('clientId', '==', userId), where('date', '==', dStr)));
            if (!hSnap.empty) {
              const habits = hSnap.docs[0].data().habits || {};
              if (Object.values(habits).filter(Boolean).length >= HABIT_COUNT) { hStreak++; }
              else break;
            } else break;
          } catch { break; }
        }
        if (!cancelled) setHabitStreak(hStreak);

      } catch (err) {
        console.error('Error loading buddy stats:', err);
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, profile]);

  // Fetch accepted buddies for @ mentions
  useEffect(() => {
    if (!clientData) return;
    const myId = clientData.id;
    (async () => {
      try {
        const [b1, b2, clientsSnap] = await Promise.all([
          getDocs(query(collection(db, 'buddies'), where('user1', '==', myId))),
          getDocs(query(collection(db, 'buddies'), where('user2', '==', myId))),
          getDocs(collection(db, 'clients'))
        ]);
        const buddyIds = new Set();
        [...b1.docs, ...b2.docs].forEach(d => {
          const data = d.data();
          buddyIds.add(data.user1 === myId ? data.user2 : data.user1);
        });
        const clientMap = {};
        clientsSnap.docs.forEach(d => { clientMap[d.id] = d.data(); });
        setAllClients(Array.from(buddyIds).filter(id => clientMap[id]).map(id => ({
          id, name: clientMap[id].name, photoURL: clientMap[id].photoURL || null
        })));
      } catch (err) { console.error('Error loading buddies for mentions:', err); }
    })();
  }, [clientData]);

  // Notification helper
  const createNotification = async (toId, type, extra = {}) => {
    if (!clientData || toId === clientData.id) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        toId,
        fromId: clientData.id,
        fromName: clientData.name || 'Someone',
        fromPhotoURL: clientData.photoURL || null,
        type,
        read: false,
        createdAt: serverTimestamp(),
        ...extra
      });
    } catch (err) {
      console.error('Notification error:', err);
      if (err.code === 'permission-denied') {
        showToast('Notifications blocked — check Firestore rules', 'error');
      }
    }
  };

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
      await createNotification(userId, 'buddy_request');
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
      await createNotification(userId, 'buddy_accept');
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

  // Fetch journey posts for this user
  const fetchJourney = useCallback(async () => {
    if (!userId) return;
    setJourneyLoading(true);
    try {
      const postsSnap = await getDocs(
        query(
          collection(db, 'posts'),
          where('authorId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(30)
        )
      );
      setJourneyPosts(postsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Check which posts current user liked
      if (clientData) {
        const likesSnap = await getDocs(
          query(collection(db, 'postLikes'), where('userId', '==', clientData.id))
        );
        setLikedPosts(new Set(likesSnap.docs.map(d => d.data().postId)));
      }
    } catch (err) {
      console.error('Error loading journey:', err);
    } finally {
      setJourneyLoading(false);
    }
  }, [userId, clientData]);

  useEffect(() => {
    if (!loading && profile) fetchJourney();
  }, [loading, profile, fetchJourney]);

  // Delete post
  const deleteJourneyPost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setJourneyPosts(prev => prev.filter(p => p.id !== postId));
      showToast('Post deleted', 'info');
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete', 'error');
    }
  };

  // Like / unlike
  const toggleLike = async (postId) => {
    if (!clientData) return;
    const myId = clientData.id;
    const likeId = `${postId}_${myId}`;
    const isLiked = likedPosts.has(postId);

    const newLiked = new Set(likedPosts);
    if (isLiked) newLiked.delete(postId); else newLiked.add(postId);
    setLikedPosts(newLiked);
    setJourneyPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, likeCount: Math.max(0, (p.likeCount || 0) + (isLiked ? -1 : 1)) } : p
    ));

    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'postLikes', likeId));
        await updateDoc(doc(db, 'posts', postId), { likeCount: increment(-1) });
      } else {
        await setDoc(doc(db, 'postLikes', likeId), {
          postId,
          userId: myId,
          createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'posts', postId), { likeCount: increment(1) });
        // Notify post author
        const post = journeyPosts.find(p => p.id === postId);
        if (post) createNotification(post.authorId, 'like', { postId });
      }
    } catch (err) {
      console.error('Like error:', err);
      fetchJourney();
    }
  };

  // Load comments
  const loadComments = async (postId) => {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'postComments'),
          where('postId', '==', postId),
          orderBy('createdAt', 'asc'),
          limit(50)
        )
      );
      setComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    } catch (err) {
      console.error('Error loading comments:', err);
    }
  };

  const toggleComments = (postId) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
      if (!comments[postId]) loadComments(postId);
    }
    setExpandedComments(newExpanded);
  };

  // @ mention helpers
  const handleMentionInput = (text, target) => {
    const atMatch = text.match(/@(\w*)$/);
    if (atMatch) {
      setMentionActive(true);
      setMentionTarget(target);
      const filtered = allClients.filter(c => c.name && c.name.toLowerCase().includes(atMatch[1].toLowerCase())).slice(0, 5);
      setMentionResults(filtered);
    } else {
      setMentionActive(false);
      setMentionResults([]);
    }
  };

  const insertMention = (client, target) => {
    const text = commentText[target] || '';
    const replaced = text.replace(/@\w*$/, `@${client.name} `);
    setCommentText(prev => ({ ...prev, [target]: replaced }));
    setMentionActive(false);
    setMentionResults([]);
  };

  const handleCommentInputChange = (postId, value) => {
    setCommentText(prev => ({ ...prev, [postId]: value }));
    handleMentionInput(value, postId);
  };

  const handleComment = async (postId) => {
    const text = (commentText[postId] || '').trim();
    if (!text || !clientData) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      await addDoc(collection(db, 'postComments'), {
        postId,
        authorId: clientData.id,
        authorName: clientData.name || 'Unknown',
        authorPhotoURL: clientData.photoURL || null,
        content: text,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
      // Notify post author
      const post = journeyPosts.find(p => p.id === postId);
      if (post) createNotification(post.authorId, 'comment', { postId });
      // Notify @mentioned users in the comment
      const mentionMatches = text.match(/@[\w\s]+?(?=\s@|\s*$|[.,!?])/g);
      if (mentionMatches) {
        const notified = new Set();
        mentionMatches.forEach(m => {
          const name = m.slice(1).trim();
          const client = allClients.find(c => c.name && c.name.toLowerCase() === name.toLowerCase());
          if (client && !notified.has(client.id)) {
            notified.add(client.id);
            createNotification(client.id, 'mention', { postId });
          }
        });
      }
      setCommentText(prev => ({ ...prev, [postId]: '' }));
      setJourneyPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
      ));
      await loadComments(postId);
    } catch (err) {
      console.error('Comment error:', err);
      showToast('Failed to comment', 'error');
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  if (authLoading || loading || !clientData) {
    return <div className="prf-loading" data-theme={isDark ? 'dark' : 'light'}><div className="prf-spinner" /></div>;
  }
  if (!currentUser || !isClient) return null;
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

          {/* Buddy action */}
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
        </div>

        {/* Stats */}
        {statsLoading ? (
          <div className="prf-stats-loading"><div className="prf-spinner" /></div>
        ) : (
          <>
            {/* Stats Row */}
            <div className="prf-stats">
              <div className="prf-stat">
                <span className="prf-stat-value">{totalWorkouts}</span>
                <span className="prf-stat-label">Workouts</span>
              </div>
              <div className="prf-stat">
                <span className="prf-stat-value">{formatVolume(totalVolume)}<span className="prf-stat-unit">{totalVolume >= 1000 ? '' : 'kg'}</span></span>
                <span className="prf-stat-label">{totalVolume >= 1000000 ? 'Million kg' : totalVolume >= 1000 ? 'Tonnes' : 'Volume'} Lifted</span>
              </div>
              <div className="prf-stat">
                <span className="prf-stat-value">{streakWeeks}<span className="prf-stat-unit">wk</span></span>
                <span className="prf-stat-label">Streak</span>
              </div>
            </div>

            {/* Programme + Habit Streak Row */}
            {(programmeName || habitStreak > 0) && (
              <div className="prf-info-row">
                {programmeName && (
                  <div className="prf-info-card info-programme">
                    <div className="prf-info-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    </div>
                    <div className="prf-info-text">
                      <span className="prf-info-label">{programmeName}</span>
                      <div className="prf-info-progress-bar">
                        <div className="prf-info-progress-fill" style={{ width: `${Math.min(programmePct, 100)}%` }} />
                      </div>
                      <span className="prf-info-sub">{programmePct}% complete</span>
                    </div>
                  </div>
                )}
                {habitStreak > 0 && (
                  <div className="prf-info-card info-habit">
                    <div className="prf-info-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                    </div>
                    <div className="prf-info-text">
                      <span className="prf-info-value">{habitStreak} day{habitStreak !== 1 ? 's' : ''}</span>
                      <span className="prf-info-sub">Habit Streak</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Top PBs */}
            {topPBs.length > 0 && (
              <div className="prf-section">
                <h2 className="prf-section-title">Top Lifts</h2>
                <div className="prf-pb-list">
                  {topPBs.map((pb, i) => (
                    <div key={i} className="prf-pb-item">
                      <div className="prf-pb-rank">{i === 0 ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z"/></svg>
                      ) : `#${i + 1}`}</div>
                      <span className="prf-pb-name">{pb.name}</span>
                      <span className="prf-pb-weight">{pb.weight}<span className="prf-pb-unit">kg</span> x{pb.reps}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Badges */}
            {unlockedBadges.length > 0 && (
              <div className="prf-section">
                <h2 className="prf-section-title">Badges Earned ({unlockedBadges.length})</h2>
                <div className="prf-badge-row">
                  {unlockedBadges.map(id => {
                    const labels = {
                      first_workout: 'First Rep', workouts_10: 'On Fire', workouts_25: 'Lightning',
                      workouts_50: 'Iron Will', workouts_100: 'Century', streak_2: '2 Wk Warrior',
                      streak_4: 'Month Strong', streak_8: 'Unbreakable', programme_done: 'Finisher',
                      habits_7: 'Habit Machine', nutrition_7: 'Fuel Master', first_pb: 'Record Breaker',
                      pbs_5: 'Climbing', leaderboard_join: 'Competitor',
                    };
                    return (
                      <div key={id} className="prf-badge-chip">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                          <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z"/>
                        </svg>
                        <span>{labels[id] || id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Journey */}
        <div className="prf-section">
          <h2 className="prf-section-title">{`${profile.name?.split(' ')[0]}'s Journey`}</h2>

          {/* Journey Posts */}
          {journeyLoading ? (
            <div className="journey-loading"><div className="prf-spinner" /></div>
          ) : journeyPosts.length === 0 ? (
            <div className="journey-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
              <p>No posts yet</p>
            </div>
          ) : (
            <div className="journey-list">
              {journeyPosts.map(post => (
                <div key={post.id} className="journey-post">
                  <div className="journey-post-header">
                    <div className="journey-post-avatar">
                      {post.authorPhotoURL ? (
                        <img src={post.authorPhotoURL} alt="" />
                      ) : (
                        <span>{getInitials(post.authorName)}</span>
                      )}
                    </div>
                    <div className="journey-post-meta">
                      <span className="journey-post-name">{post.authorName}</span>
                      <span className="journey-post-time">{timeAgo(post.createdAt)}</span>
                    </div>
                    {post.authorId === clientData.id && (
                      <button className="journey-delete-btn" onClick={() => deleteJourneyPost(post.id)} aria-label="Delete post">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>

                  {post.content && <p className="journey-post-content">{post.content}</p>}

                  {post.imageURL && (
                    <div className="journey-post-image">
                      <img src={post.imageURL} alt="Post" loading="lazy" />
                    </div>
                  )}

                  <div className="journey-post-actions">
                    <button
                      className={`journey-action-btn${likedPosts.has(post.id) ? ' liked' : ''}`}
                      onClick={() => toggleLike(post.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                      <span>{post.likeCount || 0}</span>
                    </button>
                    <button
                      className={`journey-action-btn${expandedComments.has(post.id) ? ' active' : ''}`}
                      onClick={() => toggleComments(post.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span>{post.commentCount || 0}</span>
                    </button>
                  </div>

                  {/* Comments */}
                  {expandedComments.has(post.id) && (
                    <div className="journey-comments">
                      {comments[post.id]?.length > 0 ? (
                        comments[post.id].map(c => (
                          <div key={c.id} className="journey-comment">
                            <div className="journey-comment-avatar" onClick={() => navigate(`/client/core-buddy/profile/${c.authorId}`)}>
                              {c.authorPhotoURL ? (
                                <img src={c.authorPhotoURL} alt="" />
                              ) : (
                                <span>{getInitials(c.authorName)}</span>
                              )}
                            </div>
                            <div className="journey-comment-body">
                              <div className="journey-comment-bubble">
                                <span className="journey-comment-name">{c.authorName}</span>
                                <span className="journey-comment-text">{c.content}</span>
                              </div>
                              <span className="journey-comment-time">{timeAgo(c.createdAt)}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="journey-no-comments">No comments yet</p>
                      )}

                      <div className="journey-comment-input" style={{ position: 'relative' }}>
                        <input
                          type="text"
                          placeholder="Comment... (@ to mention)"
                          value={commentText[post.id] || ''}
                          onChange={e => handleCommentInputChange(post.id, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleComment(post.id); }}
                          maxLength={300}
                        />
                        {mentionActive && mentionTarget === post.id && mentionResults.length > 0 && (
                          <div className="mention-dropdown mention-dropdown-up">
                            {mentionResults.map(c => (
                              <button key={c.id} className="mention-option" onClick={() => insertMention(c, post.id)}>
                                <div className="mention-option-avatar">
                                  {c.photoURL ? <img src={c.photoURL} alt="" /> : <span>{getInitials(c.name)}</span>}
                                </div>
                                <span>{c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          onClick={() => handleComment(post.id)}
                          disabled={!(commentText[post.id] || '').trim() || commentLoading[post.id]}
                        >
                          {commentLoading[post.id] ? (
                            <div className="journey-btn-spinner-sm" />
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
