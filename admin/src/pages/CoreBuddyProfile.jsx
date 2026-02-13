import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, deleteDoc,
  addDoc, updateDoc, orderBy, limit, increment, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
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

function compressImage(file, maxSize = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
      else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
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

  // Journey state
  const [journeyPosts, setJourneyPosts] = useState([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyText, setJourneyText] = useState('');
  const [journeyImage, setJourneyImage] = useState(null);
  const [journeyImagePreview, setJourneyImagePreview] = useState(null);
  const [journeyPosting, setJourneyPosting] = useState(false);
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentLoading, setCommentLoading] = useState({});
  const journeyTextRef = useRef(null);
  const journeyFileRef = useRef(null);

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

  // Image selection
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Image must be under 10MB', 'error');
      return;
    }
    setJourneyImage(file);
    setJourneyImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setJourneyImage(null);
    if (journeyImagePreview) URL.revokeObjectURL(journeyImagePreview);
    setJourneyImagePreview(null);
    if (journeyFileRef.current) journeyFileRef.current.value = '';
  };

  // Create journey post
  const handleJourneyPost = async () => {
    if ((!journeyText.trim() && !journeyImage) || journeyPosting || !clientData) return;
    setJourneyPosting(true);
    try {
      let imageURL = null;

      if (journeyImage) {
        const compressed = await compressImage(journeyImage);
        const imgId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const storageRef = ref(storage, `postImages/${clientData.id}/${imgId}`);
        await uploadBytes(storageRef, compressed);
        imageURL = await getDownloadURL(storageRef);
      }

      await addDoc(collection(db, 'posts'), {
        authorId: clientData.id,
        authorName: clientData.name || 'Unknown',
        authorPhotoURL: clientData.photoURL || null,
        content: journeyText.trim(),
        type: imageURL ? 'image' : 'text',
        imageURL: imageURL || null,
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0
      });

      setJourneyText('');
      clearImage();
      if (journeyTextRef.current) journeyTextRef.current.style.height = 'auto';
      await fetchJourney();
      showToast('Posted!', 'success');
    } catch (err) {
      console.error('Error posting:', err);
      showToast('Failed to post', 'error');
    } finally {
      setJourneyPosting(false);
    }
  };

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

  // Auto-resize textarea
  const handleJourneyTextInput = (e) => {
    setJourneyText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
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

        {/* My Journey */}
        <div className="prf-section">
          <h2 className="prf-section-title">{isOwnProfile ? 'My Journey' : `${profile.name?.split(' ')[0]}'s Journey`}</h2>

          {/* Compose — own profile only */}
          {isOwnProfile && (
            <div className="journey-compose">
              <div className="journey-compose-avatar">
                {clientData.photoURL ? (
                  <img src={clientData.photoURL} alt="" />
                ) : (
                  <span>{getInitials(clientData.name)}</span>
                )}
              </div>
              <div className="journey-compose-body">
                <textarea
                  ref={journeyTextRef}
                  placeholder="Share your progress..."
                  value={journeyText}
                  onChange={handleJourneyTextInput}
                  rows={1}
                  maxLength={500}
                />
                {journeyImagePreview && (
                  <div className="journey-image-preview">
                    <img src={journeyImagePreview} alt="Preview" />
                    <button className="journey-image-remove" onClick={clearImage} aria-label="Remove image">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                    </button>
                  </div>
                )}
                <div className="journey-compose-actions">
                  <button className="journey-image-btn" onClick={() => journeyFileRef.current?.click()} aria-label="Add image">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  </button>
                  <input
                    ref={journeyFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    hidden
                  />
                  {(journeyText.trim() || journeyImage) && (
                    <button className="journey-post-btn" onClick={handleJourneyPost} disabled={journeyPosting}>
                      {journeyPosting ? <div className="journey-btn-spinner" /> : 'Post'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Journey Posts */}
          {journeyLoading ? (
            <div className="journey-loading"><div className="prf-spinner" /></div>
          ) : journeyPosts.length === 0 ? (
            <div className="journey-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
              </svg>
              <p>{isOwnProfile ? 'Start sharing your fitness journey!' : 'No posts yet'}</p>
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

                      <div className="journey-comment-input">
                        <input
                          type="text"
                          placeholder="Write a comment..."
                          value={commentText[post.id] || ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleComment(post.id); }}
                          maxLength={300}
                        />
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
