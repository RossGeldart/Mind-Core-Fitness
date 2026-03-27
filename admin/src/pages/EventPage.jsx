import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, query, where, getDocs, addDoc, deleteDoc,
  updateDoc, increment, serverTimestamp, Timestamp, orderBy
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './EventPage.css';

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
  const { clientId, clientDoc } = useAuth();
  const { theme } = useTheme();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbTab, setLbTab] = useState(null); // set after event loads
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

      // Set default leaderboard tab based on category
      const config = CATEGORY_CONFIG[evt.category] || CATEGORY_CONFIG.fitness;
      setLbTab(config.tabs[0]);
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
    if (!event || participants.length === 0) return;
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

      for (const batch of batches) {
        if (config.sources.includes('workoutLogs')) {
          const q = query(
            collection(db, 'workoutLogs'),
            where('clientId', 'in', batch),
            where('completedAt', '>=', startTs),
            where('completedAt', '<=', endTs)
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            const data = d.data();
            const s = stats[data.clientId];
            if (!s) return;
            s.workouts++;
            if (!data.type) s.minutes += data.duration || 0;
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
          const q = query(
            collection(db, 'activityLogs'),
            where('clientId', 'in', batch),
            where('completedAt', '>=', startTs),
            where('completedAt', '<=', endTs)
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            const data = d.data();
            const s = stats[data.clientId];
            if (!s) return;
            s.workouts++;
            s.minutes += data.duration || 0;
          });
        }

        if (config.sources.includes('habitLogs')) {
          const q = query(
            collection(db, 'habitLogs'),
            where('clientId', 'in', batch),
            where('date', '>=', event.startDate.toISOString().split('T')[0]),
            where('date', '<=', event.endDate.toISOString().split('T')[0])
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            const data = d.data();
            const s = stats[data.clientId];
            if (!s) return;
            // Count days with at least some habits completed
            const completed = Object.values(data.habits || {}).filter(Boolean).length;
            if (completed > 0) s.completion++;
          });
        }

        if (config.sources.includes('nutritionLogs')) {
          const q = query(
            collection(db, 'nutritionLogs'),
            where('clientId', 'in', batch),
            where('date', '>=', event.startDate.toISOString().split('T')[0]),
            where('date', '<=', event.endDate.toISOString().split('T')[0])
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
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

      // Set my progress
      if (stats[clientId]) {
        setMyProgress(stats[clientId]);
      }
    } catch (err) {
      console.error('Error building leaderboard:', err);
    } finally {
      setLbLoading(false);
    }
  }, [event, participants, lbTab, clientId]);

  // Fetch event feed
  const fetchPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const q = query(
        collection(db, 'events', eventId, 'feed'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading event feed:', err);
    } finally {
      setPostsLoading(false);
    }
  }, [eventId]);

  // Handle posting to event feed
  const handlePost = async () => {
    if (!postText.trim() && !postImage) return;
    setPosting(true);
    try {
      let imageURL = '';
      if (postImage) {
        const compressed = await compressImage(postImage);
        const storageRef = ref(storage, `events/${eventId}/feed/${clientId}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, compressed);
        imageURL = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, 'events', eventId, 'feed'), {
        authorId: clientId,
        authorName: clientDoc?.name || 'Unknown',
        authorPhotoURL: clientDoc?.photoURL || '',
        content: postText.trim(),
        imageURL,
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

  // Initial load
  useEffect(() => { fetchEvent(); }, [fetchEvent]);
  useEffect(() => { if (event) fetchParticipants(); }, [event, fetchParticipants]);
  useEffect(() => {
    if (activeTab === 'leaderboard' && event && participants.length > 0) fetchLeaderboard();
  }, [activeTab, event, participants, lbTab, fetchLeaderboard]);
  useEffect(() => {
    if (activeTab === 'feed' && event) fetchPosts();
  }, [activeTab, event, fetchPosts]);

  const formatDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const isParticipant = participants.some(p => p.id === clientId);

  // Calculate days progress
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

          {/* My progress (if participating and event active/completed) */}
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
              <p>No activity yet. Start logging to climb the leaderboard!</p>
            </div>
          ) : (
            <>
              {/* Podium - top 3 */}
              {leaderboard.length >= 3 && (
                <div className="evp-podium">
                  {[1, 0, 2].map(idx => {
                    const entry = leaderboard[idx];
                    if (!entry) return null;
                    const rank = idx + 1;
                    return (
                      <div key={entry.id} className={`evp-podium-card evp-podium-${rank}`}>
                        <div className="evp-podium-avatar" style={{ borderColor: MEDAL_COLORS[idx] }}>
                          {entry.photoURL ? (
                            <img src={entry.photoURL} alt="" />
                          ) : (
                            <span>{getInitials(entry.name)}</span>
                          )}
                        </div>
                        <span className="evp-podium-name">
                          {entry.name.split(' ')[0]}
                          {entry.id === clientId && <span className="evp-you-badge">You</span>}
                        </span>
                        <span className="evp-podium-stat">{getStatValue(entry, lbTab)}</span>
                        <div className="evp-podium-rank" style={{ background: MEDAL_COLORS[idx] }}>
                          {rank === 1 && (
                            <svg className="evp-crown" width="16" height="16" viewBox="0 0 24 24" fill="#FFD700"><path d="M2 20h20L19 9l-5 4-2-6-2 6-5-4-3 11z"/></svg>
                          )}
                          {rank}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rankings list */}
              <div className="evp-rankings">
                {leaderboard.slice(leaderboard.length >= 3 ? 3 : 0).map((entry, i) => {
                  const rank = (leaderboard.length >= 3 ? 3 : 0) + i + 1;
                  return (
                    <div key={entry.id} className={`evp-rank-item ${entry.id === clientId ? 'evp-rank-you' : ''}`}>
                      <span className="evp-rank-num">{rank}</span>
                      <div className="evp-rank-avatar">
                        {entry.photoURL ? (
                          <img src={entry.photoURL} alt="" />
                        ) : (
                          <span>{getInitials(entry.name)}</span>
                        )}
                      </div>
                      <span className="evp-rank-name">
                        {entry.name}
                        {entry.id === clientId && <span className="evp-you-badge">You</span>}
                      </span>
                      <span className="evp-rank-stat">{getStatValue(entry, lbTab)}</span>
                    </div>
                  );
                })}
              </div>

              {/* If less than 3 participants, show simple list */}
              {leaderboard.length < 3 && leaderboard.length > 0 && (
                <div className="evp-rankings">
                  {leaderboard.map((entry, i) => (
                    <div key={entry.id} className={`evp-rank-item ${entry.id === clientId ? 'evp-rank-you' : ''}`}>
                      <span className="evp-rank-num">{i + 1}</span>
                      <div className="evp-rank-avatar">
                        {entry.photoURL ? (
                          <img src={entry.photoURL} alt="" />
                        ) : (
                          <span>{getInitials(entry.name)}</span>
                        )}
                      </div>
                      <span className="evp-rank-name">
                        {entry.name}
                        {entry.id === clientId && <span className="evp-you-badge">You</span>}
                      </span>
                      <span className="evp-rank-stat">{getStatValue(entry, lbTab)}</span>
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
                {clientDoc?.photoURL ? (
                  <img src={clientDoc.photoURL} alt="" />
                ) : (
                  <span>{getInitials(clientDoc?.name)}</span>
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
                    {post.authorId === clientId && (
                      <button className="evp-feed-delete" onClick={() => deletePost(post.id)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </div>
                  {post.content && <p className="evp-feed-content">{post.content}</p>}
                  {post.imageURL && <img className="evp-feed-image" src={post.imageURL} alt="" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
