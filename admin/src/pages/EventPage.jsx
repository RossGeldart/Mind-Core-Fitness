import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, query, where, getDocs, addDoc, deleteDoc,
  serverTimestamp, Timestamp, orderBy, updateDoc, setDoc, increment
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './EventPage.css';
import './Leaderboard.css';

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name[0].toUpperCase();
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatVolume(vol) {
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return vol.toLocaleString();
}

const MEDAL_COLORS = ['#FFD700', '#A8B4C0', '#CD7F32'];

// Map event category to what data we track
const CATEGORY_CONFIG = {
  fitness:     { tabs: ['workouts', 'minutes', 'volume'], label: 'Workouts', sources: ['workoutLogs', 'activityLogs'] },
  strength:    { tabs: ['workouts', 'volume'],            label: 'Workouts', sources: ['workoutLogs'] },
  cardio:      { tabs: ['workouts', 'minutes'],           label: 'Workouts', sources: ['workoutLogs', 'activityLogs'] },
  habits:      { tabs: ['completion'],                    label: 'Habit Days', sources: ['habitLogs'] },
  nutrition:   { tabs: ['daysTracked'],                   label: 'Days Tracked', sources: ['nutritionLogs'] },
  flexibility: { tabs: ['workouts', 'minutes'],           label: 'Sessions', sources: ['activityLogs'] },
  mindset:     { tabs: ['completion'],                    label: 'Habit Days', sources: ['habitLogs'] },
  wellness:    { tabs: ['completion'],                    label: 'Habit Days', sources: ['habitLogs'] },
  recovery:    { tabs: ['completion'],                    label: 'Habit Days', sources: ['habitLogs'] },
  community:   { tabs: ['workouts', 'minutes'],           label: 'Activity', sources: ['workoutLogs', 'activityLogs'] },
};

function compressImage(file, maxW = 800, quality = 0.7) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = (maxW / w) * h; w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function EventPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { clientData } = useAuth();
  const { theme } = useTheme();
  const myId = clientData?.id;

  // Create in-app + push notification
  const createNotification = async (toId, type) => {
    if (!clientData || toId === myId) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        toId,
        fromId: myId,
        fromName: clientData.name || 'Someone',
        fromPhotoURL: clientData.photoURL || null,
        type,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Notification error:', err);
    }
  };

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbTab, setLbTab] = useState(null);
  const [participants, setParticipants] = useState([]);

  // Feed
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postText, setPostText] = useState('');
  const [postImage, setPostImage] = useState(null);
  const [postImagePreview, setPostImagePreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  // Feed interactions
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentLoading, setCommentLoading] = useState({});

  // My progress
  const [myProgress, setMyProgress] = useState(null);

  // Fetch event details
  const fetchEvent = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'events', eventId));
      if (!snap.exists()) { navigate('/client/core-buddy/buddies'); return; }
      const data = snap.data();
      const start = data.startDate?.toDate?.() || new Date(data.startDate);
      const end = data.endDate?.toDate?.() || new Date(data.endDate);
      const now = new Date();
      let status = 'upcoming';
      if (now >= start && now <= end) status = 'active';
      else if (now > end) status = 'completed';

      const evt = { id: snap.id, ...data, startDate: start, endDate: end, status };
      setEvent(evt);

      const config = CATEGORY_CONFIG[evt.category] || CATEGORY_CONFIG.fitness;
      const savedStat = evt.leaderboardStat;
      setLbTab(savedStat && config.tabs.includes(savedStat) ? savedStat : config.tabs[0]);
    } catch (err) {
      console.error('Error loading event:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId, navigate]);

  // Fetch participants
  const fetchParticipants = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'events', eventId, 'participants'));
      const parts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setParticipants(parts);
    } catch (err) {
      console.error('Error loading participants:', err);
    }
  }, [eventId]);

  // Fetch leaderboard stats from real data
  const fetchLeaderboard = useCallback(async () => {
    if (!event || participants.length === 0) {
      setLeaderboard([]);
      setLbLoading(false);
      return;
    }
    setLbLoading(true);
    try {
      const config = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.fitness;
      const startTs = Timestamp.fromDate(event.startDate);
      const endTs = Timestamp.fromDate(event.endDate);
      const participantIds = participants.map(p => p.id);

      // Build stats per participant
      const stats = {};
      participants.forEach(p => {
        stats[p.id] = {
          id: p.id,
          name: p.name || 'Unknown',
          photoURL: p.photoURL || '',
          workouts: 0,
          minutes: 0,
          volume: 0,
          completion: 0,
          daysTracked: 0,
        };
      });

      // Fetch in batches of 10 (Firestore 'in' limit)
      const batches = [];
      for (let i = 0; i < participantIds.length; i += 10) {
        batches.push(participantIds.slice(i, i + 10));
      }

      // Helper: run query with composite-index fallback (fetch all by clientId, filter dates client-side)
      const safeQuery = async (col, batch, dateField, startVal, endVal, isTimestamp) => {
        try {
          const q = query(
            collection(db, col),
            where('clientId', 'in', batch),
            where(dateField, '>=', startVal),
            where(dateField, '<=', endVal)
          );
          return (await getDocs(q)).docs;
        } catch (err) {
          // Composite index likely missing — fallback to client-side date filtering
          console.warn(`Index missing for ${col}, using fallback:`, err.message);
          const q = query(collection(db, col), where('clientId', 'in', batch));
          const snap = await getDocs(q);
          return snap.docs.filter(d => {
            const val = d.data()[dateField];
            if (isTimestamp) {
              const ts = val?.toDate?.() ? val.toDate().getTime() : 0;
              return ts >= startVal.toDate().getTime() && ts <= endVal.toDate().getTime();
            }
            return val >= startVal && val <= endVal;
          });
        }
      };

      const startDateStr = event.startDate.toISOString().split('T')[0];
      const endDateStr = event.endDate.toISOString().split('T')[0];

      for (const batch of batches) {
        if (config.sources.includes('workoutLogs')) {
          const docs = await safeQuery('workoutLogs', batch, 'completedAt', startTs, endTs, true);
          docs.forEach(d => {
            const data = d.data();
            const s = stats[data.clientId];
            if (!s) return;
            s.workouts++;
            if (!data.type) s.minutes += data.actualMinutes ?? data.duration ?? 0;
            if (data.type === 'custom_sets' && data.exercises) {
              data.exercises.forEach(ex => {
                (ex.sets || []).forEach(set => {
                  s.volume += (parseInt(set.reps) || 0) * (parseFloat(set.weight) || 0);
                });
              });
            }
          });
        }

        if (config.sources.includes('activityLogs')) {
          const docs = await safeQuery('activityLogs', batch, 'completedAt', startTs, endTs, true);
          docs.forEach(d => {
            const data = d.data();
            const s = stats[data.clientId];
            if (!s) return;
            s.workouts++;
            s.minutes += data.duration || 0;
          });
        }

        if (config.sources.includes('habitLogs')) {
          const docs = await safeQuery('habitLogs', batch, 'date', startDateStr, endDateStr, false);
          docs.forEach(d => {
            const data = d.data();
            const s = stats[data.clientId];
            if (!s) return;
            const completed = Object.values(data.habits || {}).filter(Boolean).length;
            if (completed > 0) s.completion++;
          });
        }

        if (config.sources.includes('nutritionLogs')) {
          const docs = await safeQuery('nutritionLogs', batch, 'date', startDateStr, endDateStr, false);
          docs.forEach(d => {
            const data = d.data();
            const s = stats[data.clientId];
            if (!s) return;
            s.daysTracked++;
          });
        }
      }

      // Sort by active tab metric
      const sorted = Object.values(stats).sort((a, b) => {
        return (b[lbTab] || 0) - (a[lbTab] || 0) || a.name.localeCompare(b.name);
      });

      setLeaderboard(sorted);

      if (myId && stats[myId]) {
        setMyProgress(stats[myId]);
      }
    } catch (err) {
      console.error('Error building leaderboard:', err);
    } finally {
      setLbLoading(false);
    }
  }, [event, participants, lbTab, myId]);

  // Fetch event feed + liked status
  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const q = query(
        collection(db, 'events', eventId, 'feed'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Load which posts the current user has liked
      if (myId) {
        const likesSnap = await getDocs(
          query(collection(db, 'events', eventId, 'feedLikes'), where('userId', '==', myId))
        );
        const liked = new Set();
        likesSnap.docs.forEach(d => liked.add(d.data().postId));
        setLikedPosts(liked);
      }
    } catch (err) {
      console.error('Error loading event feed:', err);
    } finally {
      setPostsLoading(false);
    }
  }, [eventId, myId]);

  // Handle posting to event feed
  const handlePost = async () => {
    if (!postText.trim() && !postImage) return;
    setPosting(true);
    try {
      let imageURL = '';
      if (postImage) {
        const compressed = await compressImage(postImage);
        const storageRef = ref(storage, `events/${eventId}/feed/${myId}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, compressed);
        imageURL = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, 'events', eventId, 'feed'), {
        authorId: myId,
        authorName: clientData?.name || 'Unknown',
        authorPhotoURL: clientData?.photoURL || '',
        content: postText.trim(),
        imageURL,
        likeCount: 0,
        commentCount: 0,
        createdAt: serverTimestamp(),
      });
      setPostText('');
      setPostImage(null);
      setPostImagePreview(null);
      await fetchPosts();
    } catch (err) {
      console.error('Error posting:', err);
    } finally {
      setPosting(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPostImage(file);
    const reader = new FileReader();
    reader.onload = ev => setPostImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const deletePost = async (postId) => {
    try {
      await deleteDoc(doc(db, 'events', eventId, 'feed', postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  // Toggle like on a feed post
  const toggleLike = async (postId) => {
    if (!myId) return;
    const likeDocId = `${postId}_${myId}`;
    const isLiked = likedPosts.has(postId);
    const newLiked = new Set(likedPosts);
    if (isLiked) newLiked.delete(postId); else newLiked.add(postId);
    setLikedPosts(newLiked);
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, likeCount: Math.max(0, (p.likeCount || 0) + (isLiked ? -1 : 1)) } : p
    ));
    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'events', eventId, 'feedLikes', likeDocId));
        await updateDoc(doc(db, 'events', eventId, 'feed', postId), { likeCount: increment(-1) });
      } else {
        await setDoc(doc(db, 'events', eventId, 'feedLikes', likeDocId), {
          postId, userId: myId, createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'events', eventId, 'feed', postId), { likeCount: increment(1) });
        const post = posts.find(p => p.id === postId);
        if (post) createNotification(post.authorId, 'event_like');
      }
    } catch (err) {
      console.error('Like error:', err);
      fetchPosts();
    }
  };

  // Load comments for a post
  const loadComments = async (postId) => {
    try {
      const q = query(
        collection(db, 'events', eventId, 'feedComments'),
        where('postId', '==', postId),
        orderBy('createdAt', 'asc')
      );
      const snap = await getDocs(q);
      setComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    } catch {
      // Index may be missing — fallback without orderBy
      const q = query(
        collection(db, 'events', eventId, 'feedComments'),
        where('postId', '==', postId)
      );
      const snap = await getDocs(q);
      const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setComments(prev => ({ ...prev, [postId]: sorted }));
    }
  };

  // Toggle comment section
  const toggleComments = (postId) => {
    const next = new Set(expandedComments);
    if (next.has(postId)) { next.delete(postId); } else { next.add(postId); loadComments(postId); }
    setExpandedComments(next);
  };

  // Post a comment
  const handleComment = async (postId) => {
    const text = (commentText[postId] || '').trim();
    if (!text || !myId) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      await addDoc(collection(db, 'events', eventId, 'feedComments'), {
        postId,
        authorId: myId,
        authorName: clientData?.name || 'Unknown',
        authorPhotoURL: clientData?.photoURL || '',
        content: text,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'events', eventId, 'feed', postId), { commentCount: increment(1) });
      const post = posts.find(p => p.id === postId);
      if (post) createNotification(post.authorId, 'event_comment');
      setCommentText(prev => ({ ...prev, [postId]: '' }));
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
      ));
      await loadComments(postId);
    } catch (err) {
      console.error('Comment error:', err);
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  // Delete a comment
  const deleteComment = async (postId, commentId) => {
    try {
      await deleteDoc(doc(db, 'events', eventId, 'feedComments', commentId));
      await updateDoc(doc(db, 'events', eventId, 'feed', postId), { commentCount: increment(-1) });
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: Math.max(0, (p.commentCount || 0) - 1) } : p
      ));
      setComments(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(c => c.id !== commentId) }));
    } catch (err) {
      console.error('Delete comment error:', err);
    }
  };

  // Initial load
  useEffect(() => { fetchEvent(); }, [fetchEvent]);
  useEffect(() => { if (event) fetchParticipants(); }, [event, fetchParticipants]);
  // Fetch leaderboard on overview and leaderboard tabs
  useEffect(() => {
    if ((activeTab === 'leaderboard' || activeTab === 'overview') && event && participants.length > 0) fetchLeaderboard();
  }, [activeTab, event, participants, lbTab, fetchLeaderboard]);
  useEffect(() => {
    if (activeTab === 'feed' && event) fetchPosts();
  }, [activeTab, event, fetchPosts]);

  const formatDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const isParticipant = participants.some(p => p.id === myId);

  const getDaysInfo = () => {
    if (!event) return { total: 0, elapsed: 0, remaining: 0, pct: 0 };
    const now = new Date();
    const total = Math.ceil((event.endDate - event.startDate) / (1000 * 60 * 60 * 24));
    const elapsed = Math.max(0, Math.min(total, Math.ceil((now - event.startDate) / (1000 * 60 * 60 * 24))));
    const remaining = Math.max(0, total - elapsed);
    const pct = total > 0 ? Math.round((elapsed / total) * 100) : 0;
    return { total, elapsed, remaining, pct };
  };

  const getStatValue = (stat, key) => {
    if (key === 'workouts') return stat.workouts;
    if (key === 'minutes') return formatMinutes(stat.minutes);
    if (key === 'volume') return formatVolume(stat.volume);
    if (key === 'completion') return `${stat.completion} days`;
    if (key === 'daysTracked') return `${stat.daysTracked} days`;
    return 0;
  };

  const getStatLabel = (key) => {
    if (key === 'workouts') return 'Workouts';
    if (key === 'minutes') return 'Minutes';
    if (key === 'volume') return 'Volume';
    if (key === 'completion') return 'Habit Days';
    if (key === 'daysTracked') return 'Days Tracked';
    return '';
  };

  if (loading) {
    return (
      <div className="evp-loading">
        <div className="evp-spinner" />
      </div>
    );
  }

  if (!event) return null;

  const config = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.fitness;
  const days = getDaysInfo();

  return (
    <div className={`evp-page ${theme}`}>
      {/* Header */}
      <div className="evp-header">
        <button className="evp-back" onClick={() => navigate('/client/core-buddy/buddies', { state: { tab: 'events' } })}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div className="evp-header-info">
          <h1 className="evp-title">{event.title}</h1>
          <span className={`evp-status evp-status-${event.status}`}>
            {event.status === 'active' ? 'Active' : event.status === 'upcoming' ? 'Upcoming' : 'Completed'}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="evp-tabs">
        {['overview', 'leaderboard', 'feed'].map(t => (
          <button
            key={t}
            className={`evp-tab ${activeTab === t ? 'evp-tab-active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t === 'overview' ? 'Overview' : t === 'leaderboard' ? 'Leaderboard' : 'Feed'}
          </button>
        ))}
      </div>

      <div className="evp-main">
        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <div className="evp-content">
            <div className="evp-overview-card">
              <p className="evp-desc">{event.description}</p>
              <div className="evp-overview-meta">
                <span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {formatDate(event.startDate)} — {formatDate(event.endDate)}
                </span>
                <span className="evp-category-badge">{event.category}</span>
                <span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  {participants.length} joined
                </span>
              </div>
            </div>

            {/* Progress bar */}
            {event.status === 'active' && (
              <div className="evp-progress-section">
                <h3>Event Progress</h3>
                <div className="evp-progress-bar-track">
                  <div className="evp-progress-bar-fill" style={{ width: `${days.pct}%` }} />
                </div>
                <div className="evp-progress-labels">
                  <span>Day {days.elapsed} of {days.total}</span>
                  <span>{days.remaining} days left</span>
                </div>
              </div>
            )}

            {event.status === 'upcoming' && (
              <div className="evp-countdown">
                <h3>Starts In</h3>
                <p className="evp-countdown-value">
                  {Math.max(0, Math.ceil((event.startDate - new Date()) / (1000 * 60 * 60 * 24)))} days
                </p>
              </div>
            )}

            {/* My progress */}
            {isParticipant && myProgress && event.status !== 'upcoming' && (
              <div className="evp-my-progress">
                <h3>My Stats</h3>
                <div className="evp-my-stats-grid">
                  {config.tabs.map(key => (
                    <div key={key} className="evp-my-stat">
                      <span className="evp-my-stat-value">{getStatValue(myProgress, key)}</span>
                      <span className="evp-my-stat-label">{getStatLabel(key)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Day-by-day tracker */}
            {isParticipant && event.status === 'active' && (
              <div className="evp-day-tracker">
                <h3>Daily Tracker</h3>
                <div className="evp-day-grid">
                  {Array.from({ length: days.total }, (_, i) => {
                    const dayNum = i + 1;
                    const isToday = dayNum === days.elapsed;
                    const isPast = dayNum < days.elapsed;
                    return (
                      <div
                        key={i}
                        className={`evp-day-cell ${isPast ? 'evp-day-past' : ''} ${isToday ? 'evp-day-today' : ''}`}
                      >
                        {dayNum}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Leaderboard Tab ── */}
        {activeTab === 'leaderboard' && (
          <div className="evp-content">
            {/* Leaderboard stat tabs */}
            {config.tabs.length > 1 && (
              <div className="evp-lb-tabs">
                {config.tabs.map(t => (
                  <button
                    key={t}
                    className={`evp-lb-tab ${lbTab === t ? 'evp-lb-tab-active' : ''}`}
                    onClick={() => setLbTab(t)}
                  >
                    {getStatLabel(t)}
                  </button>
                ))}
              </div>
            )}

            {lbLoading ? (
              <div className="evp-content-loading"><div className="evp-spinner" /></div>
            ) : leaderboard.length === 0 ? (
              <div className="evp-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <p>No participants yet. Be the first to join!</p>
              </div>
            ) : (
              <>
                {/* Podium — same bar style as main leaderboard */}
                {leaderboard.length > 0 && (
                  <div className="lb-podium">
                    {/* 2nd place */}
                    <div className="lb-podium-place lb-podium-2nd">
                      {leaderboard[1] ? (
                        <>
                          <div className={`lb-podium-avatar ${leaderboard[1].id === myId ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[1] }}>
                            {leaderboard[1].photoURL ? <img src={leaderboard[1].photoURL} alt="" className="lb-avatar-img" /> : getInitials(leaderboard[1].name)}
                          </div>
                          <div className="lb-podium-name">{leaderboard[1].name.split(' ')[0]}</div>
                          <div className="lb-podium-stat">{getStatValue(leaderboard[1], lbTab)}</div>
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
                      <div className={`lb-podium-avatar lb-avatar-1st ${leaderboard[0].id === myId ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[0] }}>
                        {leaderboard[0].photoURL ? <img src={leaderboard[0].photoURL} alt="" className="lb-avatar-img" /> : getInitials(leaderboard[0].name)}
                      </div>
                      <div className="lb-podium-name">{leaderboard[0].name.split(' ')[0]}</div>
                      <div className="lb-podium-stat">{getStatValue(leaderboard[0], lbTab)}</div>
                      <div className="lb-podium-bar lb-bar-1st">
                        <span className="lb-podium-rank">1</span>
                      </div>
                    </div>

                    {/* 3rd place */}
                    <div className="lb-podium-place lb-podium-3rd">
                      {leaderboard[2] ? (
                        <>
                          <div className={`lb-podium-avatar ${leaderboard[2].id === myId ? 'lb-avatar-you' : ''}`} style={{ borderColor: MEDAL_COLORS[2] }}>
                            {leaderboard[2].photoURL ? <img src={leaderboard[2].photoURL} alt="" className="lb-avatar-img" /> : getInitials(leaderboard[2].name)}
                          </div>
                          <div className="lb-podium-name">{leaderboard[2].name.split(' ')[0]}</div>
                          <div className="lb-podium-stat">{getStatValue(leaderboard[2], lbTab)}</div>
                          <div className="lb-podium-bar lb-bar-3rd">
                            <span className="lb-podium-rank">3</span>
                          </div>
                        </>
                      ) : <div className="lb-podium-spacer" />}
                    </div>
                  </div>
                )}

                {/* Rankings list (4th onwards, or all if < 3) */}
                {leaderboard.length > 3 && (
                  <div className="lb-rankings">
                    {leaderboard.slice(3).map((entry, i) => (
                      <div
                        key={entry.id}
                        className={`lb-rank-item ${entry.id === myId ? 'lb-rank-you' : ''}`}
                      >
                        <span className="lb-rank-number">{i + 4}</span>
                        <div className={`lb-rank-avatar ${entry.id === myId ? 'lb-avatar-you' : ''}`}>
                          {entry.photoURL ? <img src={entry.photoURL} alt="" className="lb-avatar-img" /> : getInitials(entry.name)}
                        </div>
                        <div className="lb-rank-info">
                          <span className="lb-rank-name">
                            {entry.name}
                            {entry.id === myId && <span className="lb-you-badge">You</span>}
                          </span>
                        </div>
                        <span className="lb-rank-stat">{getStatValue(entry, lbTab)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Feed Tab ── */}
        {activeTab === 'feed' && (
          <div className="evp-content">
            {/* Compose */}
            {isParticipant && event.status === 'active' && (
              <div className="evp-compose">
                <div className="evp-compose-avatar">
                  {clientData?.photoURL ? (
                    <img src={clientData.photoURL} alt="" />
                  ) : (
                    <span>{getInitials(clientData?.name)}</span>
                  )}
                </div>
                <div className="evp-compose-body">
                  <textarea
                    ref={textRef}
                    value={postText}
                    onChange={e => setPostText(e.target.value)}
                    placeholder="Share your progress..."
                    rows={2}
                    maxLength={500}
                  />
                  {postImagePreview && (
                    <div className="evp-compose-preview">
                      <img src={postImagePreview} alt="" />
                      <button onClick={() => { setPostImage(null); setPostImagePreview(null); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}
                  <div className="evp-compose-actions">
                    <button onClick={() => fileRef.current?.click()}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImageSelect} />
                    <button
                      className="evp-post-btn"
                      onClick={handlePost}
                      disabled={posting || (!postText.trim() && !postImage)}
                    >
                      {posting ? <span className="evp-btn-spinner" /> : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {postsLoading ? (
              <div className="evp-content-loading"><div className="evp-spinner" /></div>
            ) : posts.length === 0 ? (
              <div className="evp-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p>No posts yet. Be the first to share your progress!</p>
              </div>
            ) : (
              <div className="evp-feed">
                {posts.map(post => (
                  <div key={post.id} className="evp-feed-post">
                    <div className="evp-feed-post-header">
                      <div className="evp-feed-avatar">
                        {post.authorPhotoURL ? (
                          <img src={post.authorPhotoURL} alt="" />
                        ) : (
                          <span>{getInitials(post.authorName)}</span>
                        )}
                      </div>
                      <div className="evp-feed-post-info">
                        <span className="evp-feed-name">{post.authorName}</span>
                        <span className="evp-feed-time">
                          {post.createdAt?.toDate?.()
                            ? timeAgo(post.createdAt.toDate())
                            : ''}
                        </span>
                      </div>
                      {post.authorId === myId && (
                        <button className="evp-feed-delete" onClick={() => deletePost(post.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      )}
                    </div>
                    {post.content && <p className="evp-feed-content">{post.content}</p>}
                    {post.imageURL && <img className="evp-feed-image" src={post.imageURL} alt="" />}

                    {/* Like & Comment actions */}
                    <div className="evp-feed-actions">
                      <button
                        className={`evp-feed-action-btn${likedPosts.has(post.id) ? ' evp-liked' : ''}`}
                        onClick={() => toggleLike(post.id)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span>{post.likeCount || 0}</span>
                      </button>
                      <button
                        className={`evp-feed-action-btn${expandedComments.has(post.id) ? ' evp-active' : ''}`}
                        onClick={() => toggleComments(post.id)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span>{post.commentCount || 0}</span>
                      </button>
                    </div>

                    {/* Comments section */}
                    {expandedComments.has(post.id) && (
                      <div className="evp-comments">
                        {(comments[post.id] || []).map(c => (
                          <div key={c.id} className="evp-comment">
                            <div className="evp-comment-avatar">
                              {c.authorPhotoURL ? <img src={c.authorPhotoURL} alt="" /> : <span>{getInitials(c.authorName)}</span>}
                            </div>
                            <div className="evp-comment-body">
                              <span className="evp-comment-name">{c.authorName}</span>
                              <span className="evp-comment-text">{c.content}</span>
                              {c.authorId === myId && (
                                <button className="evp-comment-delete" onClick={() => deleteComment(post.id, c.id)}>Delete</button>
                              )}
                            </div>
                          </div>
                        ))}
                        {isParticipant && (
                          <div className="evp-comment-input">
                            <input
                              type="text"
                              value={commentText[post.id] || ''}
                              onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                              onKeyDown={e => e.key === 'Enter' && handleComment(post.id)}
                              placeholder="Write a comment..."
                            />
                            <button
                              className="evp-comment-send"
                              onClick={() => handleComment(post.id)}
                              disabled={commentLoading[post.id] || !(commentText[post.id] || '').trim()}
                            >
                              {commentLoading[post.id] ? <span className="evp-btn-spinner" /> : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <CoreBuddyNav active="community" />
    </div>
  );
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
