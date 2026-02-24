import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, setDoc, deleteDoc, addDoc,
  updateDoc, orderBy, limit, increment, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import PullToRefresh from '../components/PullToRefresh';
import BADGE_DEFS from '../utils/badgeConfig';
import './CoreBuddyBuddies.css';

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function pairId(a, b) {
  return [a, b].sort().join('_');
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

export default function CoreBuddyBuddies() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [tab, setTab] = useState('feed');            // feed | buddies | requests | search
  const [buddies, setBuddies] = useState([]);       // confirmed buddy client objects
  const [incoming, setIncoming] = useState([]);      // pending incoming requests
  const [outgoing, setOutgoing] = useState([]);      // pending outgoing requests
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  // Feed state
  const [feedPosts, setFeedPosts] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentLoading, setCommentLoading] = useState({});
  const [replyTo, setReplyTo] = useState({});
  const [commentImage, setCommentImage] = useState({});
  const [commentImagePreview, setCommentImagePreview] = useState({});
  const commentFileRefs = useRef({});

  // @ Mention state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionTarget, setMentionTarget] = useState(null);
  const [mentionResults, setMentionResults] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // @ mention helpers
  const handleMentionInput = (text, target) => {
    const atMatch = text.match(/@(\w*)$/);
    if (atMatch) {
      setMentionActive(true);
      setMentionTarget(target);
      const filtered = buddies.filter(c => c.name && c.name.toLowerCase().includes(atMatch[1].toLowerCase())).slice(0, 5);
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

  const renderWithMentions = (text) => {
    if (!text) return text;
    const parts = text.split(/(@\w[\w\s]*?\s)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@') && buddies.some(c => part.trim() === `@${c.name}`)) {
        return <span key={i} className="mention-highlight">{part.trim()}</span>;
      }
      return part;
    });
  };

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load buddy data
  const fetchData = useCallback(async () => {
    if (!clientData) return;
    setLoading(true);
    try {
      const myId = clientData.id;

      // 1. All clients (for search + name resolution)
      const clientsSnap = await getDocs(collection(db, 'clients'));
      const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllClients(clients);
      const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

      // 2. Confirmed buddies where I'm user1 or user2
      const b1 = await getDocs(query(collection(db, 'buddies'), where('user1', '==', myId)));
      const b2 = await getDocs(query(collection(db, 'buddies'), where('user2', '==', myId)));
      const buddyIds = new Set();
      [...b1.docs, ...b2.docs].forEach(d => {
        const data = d.data();
        const otherId = data.user1 === myId ? data.user2 : data.user1;
        buddyIds.add(otherId);
      });
      setBuddies(Array.from(buddyIds).map(id => clientMap[id]).filter(Boolean));

      // 3. Incoming requests (to me, pending)
      const inSnap = await getDocs(query(
        collection(db, 'buddyRequests'),
        where('toId', '==', myId),
        where('status', '==', 'pending')
      ));
      setIncoming(inSnap.docs.map(d => ({
        reqId: d.id,
        ...d.data(),
        fromClient: clientMap[d.data().fromId]
      })).filter(r => r.fromClient));

      // 4. Outgoing requests (from me, pending)
      const outSnap = await getDocs(query(
        collection(db, 'buddyRequests'),
        where('fromId', '==', myId),
        where('status', '==', 'pending')
      ));
      setOutgoing(outSnap.docs.map(d => ({
        reqId: d.id,
        ...d.data(),
        toClient: clientMap[d.data().toId]
      })).filter(r => r.toClient));
    } catch (err) {
      console.error('Error fetching buddy data:', err);
      showToast('Failed to load buddies', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientData, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Search logic
  useEffect(() => {
    if (!searchTerm.trim() || !clientData) { setSearchResults([]); return; }
    const q = searchTerm.toLowerCase();
    const myId = clientData.id;
    const buddyIdSet = new Set(buddies.map(b => b.id));
    const outgoingIdSet = new Set(outgoing.map(o => o.toId));
    const incomingIdSet = new Set(incoming.map(i => i.fromId));

    const results = allClients.filter(c => {
      if (c.id === myId) return false;
      if (!c.name) return false;
      if (!c.coreBuddyAccess && c.clientType !== 'core_buddy') return false;
      // Exclude free-tier users — buddies is a premium feature
      const isClientPremium = c.tier === 'premium' || (c.signupSource !== 'self_signup');
      if (!isClientPremium) return false;
      return c.name.toLowerCase().includes(q);
    }).map(c => ({
      ...c,
      isBuddy: buddyIdSet.has(c.id),
      isPendingOut: outgoingIdSet.has(c.id),
      isPendingIn: incomingIdSet.has(c.id),
    })).slice(0, 20);

    setSearchResults(results);
  }, [searchTerm, allClients, buddies, outgoing, incoming, clientData]);

  // Notification helper
  const createNotification = async (toId, type) => {
    if (!clientData || toId === clientData.id) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        toId,
        fromId: clientData.id,
        fromName: clientData.name || 'Someone',
        fromPhotoURL: clientData.photoURL || null,
        type,
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Notification error:', err);
      if (err.code === 'permission-denied') {
        showToast('Notifications blocked — check Firestore rules', 'error');
      }
    }
  };

  // Actions
  const sendRequest = async (toId) => {
    setActionLoading(toId);
    try {
      const reqId = `${clientData.id}_${toId}`;
      await setDoc(doc(db, 'buddyRequests', reqId), {
        fromId: clientData.id,
        toId,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      await createNotification(toId, 'buddy_request');
      showToast('Buddy request sent!', 'success');
      await fetchData();
    } catch (err) {
      console.error('Error sending request:', err);
      showToast('Failed to send request', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const acceptRequest = async (req) => {
    setActionLoading(req.reqId);
    try {
      // Create buddy pair
      const pid = pairId(req.fromId, clientData.id);
      await setDoc(doc(db, 'buddies', pid), {
        user1: [req.fromId, clientData.id].sort()[0],
        user2: [req.fromId, clientData.id].sort()[1],
        connectedAt: serverTimestamp()
      });
      // Delete the request
      await deleteDoc(doc(db, 'buddyRequests', req.reqId));
      await createNotification(req.fromId, 'buddy_accept');
      showToast('Buddy added!', 'success');
      await fetchData();
    } catch (err) {
      console.error('Error accepting request:', err);
      showToast('Failed to accept', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const declineRequest = async (req) => {
    setActionLoading(req.reqId);
    try {
      await deleteDoc(doc(db, 'buddyRequests', req.reqId));
      showToast('Request declined', 'info');
      await fetchData();
    } catch (err) {
      console.error('Error declining:', err);
      showToast('Failed to decline', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const cancelRequest = async (req) => {
    setActionLoading(req.reqId);
    try {
      await deleteDoc(doc(db, 'buddyRequests', req.reqId));
      showToast('Request cancelled', 'info');
      await fetchData();
    } catch (err) {
      console.error('Error cancelling:', err);
      showToast('Failed to cancel', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const removeBuddy = async (buddyId) => {
    setActionLoading(buddyId);
    try {
      const pid = pairId(clientData.id, buddyId);
      await deleteDoc(doc(db, 'buddies', pid));
      showToast('Buddy removed', 'info');
      await fetchData();
    } catch (err) {
      console.error('Error removing buddy:', err);
      showToast('Failed to remove buddy', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Feed functions ──
  const fetchFeed = useCallback(async () => {
    if (!clientData || buddies.length === 0) { setFeedPosts([]); return; }
    setFeedLoading(true);
    try {
      // Include own posts + all buddy posts
      const feedIds = [clientData.id, ...buddies.map(b => b.id)];
      // Firestore 'in' supports max 30 values — batch if needed
      const batches = [];
      for (let i = 0; i < feedIds.length; i += 30) {
        batches.push(feedIds.slice(i, i + 30));
      }
      let allPosts = [];
      for (const batch of batches) {
        const snap = await getDocs(
          query(collection(db, 'posts'), where('authorId', 'in', batch), orderBy('createdAt', 'desc'), limit(50))
        );
        allPosts.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      // Sort combined results by date descending
      allPosts.sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      });
      setFeedPosts(allPosts.slice(0, 50));

      // Fetch my likes
      const likesSnap = await getDocs(
        query(collection(db, 'postLikes'), where('userId', '==', clientData.id))
      );
      setLikedPosts(new Set(likesSnap.docs.map(d => d.data().postId)));
    } catch (err) {
      console.error('Error loading feed:', err);
    } finally {
      setFeedLoading(false);
    }
  }, [clientData, buddies]);

  useEffect(() => {
    if (buddies.length > 0 && tab === 'feed') fetchFeed();
  }, [buddies, tab, fetchFeed]);

  const toggleFeedLike = async (postId) => {
    if (!clientData) return;
    const myId = clientData.id;
    const likeId = `${postId}_${myId}`;
    const isLiked = likedPosts.has(postId);
    const newLiked = new Set(likedPosts);
    if (isLiked) newLiked.delete(postId); else newLiked.add(postId);
    setLikedPosts(newLiked);
    setFeedPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, likeCount: Math.max(0, (p.likeCount || 0) + (isLiked ? -1 : 1)) } : p
    ));
    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'postLikes', likeId));
        await updateDoc(doc(db, 'posts', postId), { likeCount: increment(-1) });
      } else {
        await setDoc(doc(db, 'postLikes', likeId), { postId, userId: myId, createdAt: serverTimestamp() });
        await updateDoc(doc(db, 'posts', postId), { likeCount: increment(1) });
        const post = feedPosts.find(p => p.id === postId);
        if (post) createNotification(post.authorId, 'like');
      }
    } catch (err) {
      console.error('Like error:', err);
      fetchFeed();
    }
  };

  const deleteFeedPost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setFeedPosts(prev => prev.filter(p => p.id !== postId));
      showToast('Post deleted', 'info');
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete', 'error');
    }
  };

  const loadFeedComments = async (postId) => {
    try {
      const snap = await getDocs(
        query(collection(db, 'postComments'), where('postId', '==', postId), orderBy('createdAt', 'asc'), limit(50))
      );
      setComments(prev => ({ ...prev, [postId]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }));
    } catch (err) { console.error('Error loading comments:', err); }
  };

  const toggleFeedComments = (postId) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) { newExpanded.delete(postId); }
    else { newExpanded.add(postId); if (!comments[postId]) loadFeedComments(postId); }
    setExpandedComments(newExpanded);
  };

  const handleFeedComment = async (postId) => {
    const text = (commentText[postId] || '').trim();
    const imgFile = commentImage[postId];
    if ((!text && !imgFile) || !clientData) return;
    setCommentLoading(prev => ({ ...prev, [postId]: true }));
    try {
      let imageURL = null;
      if (imgFile) {
        const imgRef = ref(storage, `comment-images/${Date.now()}_${imgFile.name}`);
        await uploadBytes(imgRef, imgFile);
        imageURL = await getDownloadURL(imgRef);
      }
      const commentData = {
        postId, authorId: clientData.id, authorName: clientData.name || 'Unknown',
        authorPhotoURL: clientData.photoURL || null, content: text || '', createdAt: serverTimestamp()
      };
      if (imageURL) commentData.imageURL = imageURL;
      const reply = replyTo[postId];
      if (reply) {
        commentData.replyToId = reply.id;
        commentData.replyToName = reply.authorName;
      }
      await addDoc(collection(db, 'postComments'), commentData);
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
      // Notify post author
      const post = feedPosts.find(p => p.id === postId);
      if (post) createNotification(post.authorId, 'comment');
      // Notify @mentioned users
      const mentionMatches = text.match(/@[\w\s]+?(?=\s@|\s*$|[.,!?])/g);
      if (mentionMatches) {
        const notified = new Set();
        mentionMatches.forEach(m => {
          const name = m.slice(1).trim();
          const client = buddies.find(c => c.name && c.name.toLowerCase() === name.toLowerCase());
          if (client && !notified.has(client.id)) {
            notified.add(client.id);
            createNotification(client.id, 'mention');
          }
        });
      }
      setCommentText(prev => ({ ...prev, [postId]: '' }));
      setCommentImage(prev => ({ ...prev, [postId]: null }));
      setCommentImagePreview(prev => ({ ...prev, [postId]: null }));
      setReplyTo(prev => ({ ...prev, [postId]: null }));
      if (commentFileRefs.current[postId]) commentFileRefs.current[postId].value = '';
      setFeedPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
      ));
      await loadFeedComments(postId);
    } catch (err) {
      console.error('Comment error:', err);
      showToast('Failed to comment', 'error');
    } finally {
      setCommentLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  const deleteFeedComment = async (postId, commentId) => {
    try {
      await deleteDoc(doc(db, 'postComments', commentId));
      await updateDoc(doc(db, 'posts', postId), { commentCount: increment(-1) });
      setComments(prev => ({ ...prev, [postId]: (prev[postId] || []).filter(c => c.id !== commentId) }));
      setFeedPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: Math.max((p.commentCount || 1) - 1, 0) } : p
      ));
    } catch (err) {
      console.error('Delete comment error:', err);
      showToast('Failed to delete comment', 'error');
    }
  };

  const handleCommentImageSelect = (postId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }
    setCommentImage(prev => ({ ...prev, [postId]: file }));
    const reader = new FileReader();
    reader.onload = ev => setCommentImagePreview(prev => ({ ...prev, [postId]: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const clearCommentImage = (postId) => {
    setCommentImage(prev => ({ ...prev, [postId]: null }));
    setCommentImagePreview(prev => ({ ...prev, [postId]: null }));
    if (commentFileRefs.current[postId]) commentFileRefs.current[postId].value = '';
  };

  const pendingCount = incoming.length;

  if (authLoading) {
    return <div className="bdy-loading"><div className="bdy-spinner" /></div>;
  }
  if (!currentUser || !isClient || !clientData) return null;

  return (
    <PullToRefresh>
    <div className="bdy-page">
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

      <main className="bdy-main">
        <h1 className="bdy-title">Buddies</h1>

        <button className="bdy-leaderboard-link" onClick={() => navigate('/client/leaderboard')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><rect x="6" y="9" width="12" height="13" rx="2"/><path d="M12 9v13"/><path d="M2 22h20"/></svg>
          <span>Leaderboard</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>

        {/* Tabs */}
        <div className="bdy-tabs">
          <button className={`bdy-tab${tab === 'feed' ? ' active' : ''}`} onClick={() => setTab('feed')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
            <span>Feed</span>
          </button>
          <button className={`bdy-tab${tab === 'buddies' ? ' active' : ''}`} onClick={() => setTab('buddies')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>Buddies</span>
          </button>
          <button className={`bdy-tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            <span>Requests</span>
            {pendingCount > 0 && <span className="bdy-tab-badge">{pendingCount}</span>}
          </button>
          <button className={`bdy-tab${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Find</span>
          </button>
        </div>

        {loading ? (
          <div className="bdy-content-loading"><div className="bdy-spinner" /></div>
        ) : (
          <>
            {/* ── Feed ── */}
            {tab === 'feed' && (
              <div className="bdy-section">
                {buddies.length === 0 ? (
                  <div className="bdy-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                    <h3>No buddies yet</h3>
                    <p>Add buddies to see their posts here!</p>
                    <button className="bdy-empty-btn" onClick={() => setTab('search')}>Find Buddies</button>
                  </div>
                ) : feedLoading ? (
                  <div className="bdy-content-loading"><div className="bdy-spinner" /></div>
                ) : feedPosts.length === 0 ? (
                  <div className="bdy-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    <h3>No posts yet</h3>
                    <p>Your buddies haven't posted anything yet</p>
                  </div>
                ) : (
                  <div className="bdy-feed-list">
                    {feedPosts.map(post => (
                      <div key={post.id} className="bdy-feed-post">
                        <div className="bdy-feed-post-header">
                          <div className="bdy-feed-avatar" onClick={() => navigate(`/client/core-buddy/profile/${post.authorId}`)}>
                            {post.authorPhotoURL ? (
                              <img src={post.authorPhotoURL} alt="" />
                            ) : (
                              <span>{getInitials(post.authorName)}</span>
                            )}
                          </div>
                          <div className="bdy-feed-meta" onClick={() => navigate(`/client/core-buddy/profile/${post.authorId}`)}>
                            <span className="bdy-feed-name">{post.authorName}</span>
                            <span className="bdy-feed-time">{timeAgo(post.createdAt)}</span>
                          </div>
                          {post.authorId === clientData?.id && (
                            <button className="bdy-feed-delete-btn" onClick={() => deleteFeedPost(post.id)} aria-label="Delete post">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          )}
                        </div>

                        {/* Post content — share cards or text/image */}
                        {post.type === 'workout_summary' && post.metadata ? (
                          <div className="bdy-feed-card">
                            <div className="bdy-feed-card-logo"><img src="/Logo.webp" alt="MCF" /></div>
                            <h3 className="bdy-feed-card-title">{post.metadata.title}</h3>
                            {post.metadata.stats?.length > 0 && (
                              <p className="bdy-feed-card-stats">{post.metadata.stats.map(s => `${s.value} ${s.label}`).join('  \u00B7  ')}</p>
                            )}
                            {!post.metadata.stats?.length && post.metadata.subtitle && (
                              <p className="bdy-feed-card-stats">{post.metadata.subtitle}</p>
                            )}
                            <p className="bdy-feed-card-cta">Completed a workout using Core Buddy</p>
                          </div>
                        ) : post.type === 'badge_earned' && post.metadata ? (
                          <div className="bdy-feed-card">
                            <div className="bdy-feed-card-logo bdy-feed-card-badge">
                              {(() => { const bd = BADGE_DEFS.find(b => b.id === post.metadata.badgeId); return bd?.img ? <img src={bd.img} alt={post.metadata.title} loading="lazy" /> : <img src="/Logo.webp" alt={post.metadata.title} />; })()}
                            </div>
                            <h3 className="bdy-feed-card-title">{post.metadata.title}</h3>
                            {post.metadata.badgeDesc && <p className="bdy-feed-card-stats">{post.metadata.badgeDesc}</p>}
                            <p className="bdy-feed-card-cta">Earned a badge on Core Buddy</p>
                          </div>
                        ) : post.type === 'habits_summary' && post.metadata ? (
                          <div className="bdy-feed-card">
                            <div className="bdy-feed-card-logo"><img src="/Logo.webp" alt="MCF" /></div>
                            <h3 className="bdy-feed-card-title">{post.metadata.title}</h3>
                            {post.metadata.stats?.length > 0 && (
                              <p className="bdy-feed-card-stats">{post.metadata.stats.map(s => `${s.value} ${s.label}`).join('  \u00B7  ')}</p>
                            )}
                            {post.metadata.subtitle && <p className="bdy-feed-card-stats">{post.metadata.subtitle}</p>}
                            <p className="bdy-feed-card-cta">Completed daily habits with Core Buddy</p>
                          </div>
                        ) : (
                          <>
                            {post.content && <p className="bdy-feed-content">{renderWithMentions(post.content)}</p>}
                            {post.imageURL && (
                              <div className="bdy-feed-image"><img src={post.imageURL} alt="Post" loading="lazy" /></div>
                            )}
                          </>
                        )}

                        {/* Like & Comment actions */}
                        <div className="bdy-feed-actions">
                          <button className={`bdy-feed-action-btn${likedPosts.has(post.id) ? ' liked' : ''}`} onClick={() => toggleFeedLike(post.id)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                            <span>{post.likeCount || 0}</span>
                          </button>
                          <button className={`bdy-feed-action-btn${expandedComments.has(post.id) ? ' active' : ''}`} onClick={() => toggleFeedComments(post.id)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            <span>{post.commentCount || 0}</span>
                          </button>
                        </div>

                        {/* Comments section */}
                        {expandedComments.has(post.id) && (
                          <div className="bdy-feed-comments">
                            {comments[post.id]?.length > 0 ? (
                              comments[post.id].map(c => (
                                <div key={c.id} className="bdy-feed-comment">
                                  <div className="bdy-feed-comment-avatar">
                                    {c.authorPhotoURL ? <img src={c.authorPhotoURL} alt="" /> : <span>{getInitials(c.authorName)}</span>}
                                  </div>
                                  <div className="bdy-feed-comment-body">
                                    <div className="bdy-feed-comment-bubble">
                                      <span className="bdy-feed-comment-name">{c.authorName}</span>
                                      {c.replyToName && (
                                        <span className="bdy-feed-comment-reply-tag">
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                                          {c.replyToName}
                                        </span>
                                      )}
                                      {c.content && <span className="bdy-feed-comment-text">{renderWithMentions(c.content)}</span>}
                                      {c.imageURL && <img className="bdy-feed-comment-img" src={c.imageURL} alt="Comment" loading="lazy" />}
                                    </div>
                                    <div className="bdy-feed-comment-row">
                                      <span className="bdy-feed-comment-time">{timeAgo(c.createdAt)}</span>
                                      <button className="bdy-feed-comment-reply-btn" onClick={() => setReplyTo(prev => ({ ...prev, [post.id]: { id: c.id, authorName: c.authorName } }))}>Reply</button>
                                      {c.authorId === clientData?.id && (
                                        <button className="bdy-feed-comment-del-btn" onClick={() => deleteFeedComment(post.id, c.id)} aria-label="Delete comment">
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="bdy-feed-no-comments">No comments yet</p>
                            )}

                            {replyTo[post.id] && (
                              <div className="bdy-feed-replying">
                                <span>Replying to <strong>{replyTo[post.id].authorName}</strong></span>
                                <button onClick={() => setReplyTo(prev => ({ ...prev, [post.id]: null }))} aria-label="Cancel reply">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                                </button>
                              </div>
                            )}

                            {commentImagePreview[post.id] && (
                              <div className="bdy-feed-comment-img-preview">
                                <img src={commentImagePreview[post.id]} alt="Preview" />
                                <button onClick={() => clearCommentImage(post.id)} aria-label="Remove image">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                                </button>
                              </div>
                            )}

                            <div className="bdy-feed-comment-input" style={{ position: 'relative' }}>
                              <button className="bdy-feed-comment-img-btn" onClick={() => commentFileRefs.current[post.id]?.click()} aria-label="Add image">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                              </button>
                              <input
                                ref={el => { commentFileRefs.current[post.id] = el; }}
                                type="file" accept="image/*"
                                onChange={e => handleCommentImageSelect(post.id, e)}
                                hidden
                              />
                              <input
                                type="text"
                                placeholder="Comment"
                                value={commentText[post.id] || ''}
                                onChange={e => { setCommentText(prev => ({ ...prev, [post.id]: e.target.value })); handleMentionInput(e.target.value, post.id); }}
                                onKeyDown={e => { if (e.key === 'Enter') handleFeedComment(post.id); }}
                                maxLength={300}
                              />
                              {mentionActive && mentionTarget === post.id && mentionResults.length > 0 && (
                                <div className="bdy-feed-mention-dropdown">
                                  {mentionResults.map(c => (
                                    <button key={c.id} className="bdy-feed-mention-option" onClick={() => insertMention(c, post.id)}>
                                      <div className="bdy-feed-mention-avatar">
                                        {c.photoURL ? <img src={c.photoURL} alt="" /> : <span>{getInitials(c.name)}</span>}
                                      </div>
                                      <span>{c.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button onClick={() => handleFeedComment(post.id)} disabled={!(commentText[post.id] || '').trim() && !commentImage[post.id] || commentLoading[post.id]}>
                                {commentLoading[post.id] ? (
                                  <div className="bdy-btn-spinner" />
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--color-primary)" stroke="none"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
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
            )}

            {/* ── My Buddies ── */}
            {tab === 'buddies' && (
              <div className="bdy-section">
                {buddies.length === 0 ? (
                  <div className="bdy-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <h3>No buddies yet</h3>
                    <p>Find members and send buddy requests to connect!</p>
                    <button className="bdy-empty-btn" onClick={() => setTab('search')}>Find Buddies</button>
                  </div>
                ) : (
                  <div className="bdy-list">
                    {buddies.map(b => (
                      <div key={b.id} className="bdy-card" onClick={() => navigate(`/client/core-buddy/profile/${b.id}`)}>
                        <div className="bdy-avatar">
                          {b.photoURL ? (
                            <img src={b.photoURL} alt={b.name} />
                          ) : (
                            <span>{getInitials(b.name)}</span>
                          )}
                        </div>
                        <div className="bdy-card-info">
                          <span className="bdy-card-name">{b.name}</span>
                        </div>
                        <button
                          className="bdy-view-btn"
                          onClick={(e) => { e.stopPropagation(); navigate(`/client/core-buddy/profile/${b.id}`); }}
                          aria-label="View profile"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Requests ── */}
            {tab === 'requests' && (
              <div className="bdy-section">
                {incoming.length > 0 && (
                  <>
                    <h3 className="bdy-section-title">Incoming</h3>
                    <div className="bdy-list">
                      {incoming.map(req => (
                        <div key={req.reqId} className="bdy-card">
                          <div className="bdy-avatar">
                            {req.fromClient.photoURL ? (
                              <img src={req.fromClient.photoURL} alt={req.fromClient.name} />
                            ) : (
                              <span>{getInitials(req.fromClient.name)}</span>
                            )}
                          </div>
                          <div className="bdy-card-info">
                            <span className="bdy-card-name">{req.fromClient.name}</span>
                            <span className="bdy-card-sub">wants to be your buddy</span>
                          </div>
                          <div className="bdy-action-pair">
                            <button
                              className="bdy-accept-btn"
                              onClick={() => acceptRequest(req)}
                              disabled={actionLoading === req.reqId}
                            >
                              {actionLoading === req.reqId ? <div className="bdy-btn-spinner" /> : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                              )}
                            </button>
                            <button
                              className="bdy-decline-btn"
                              onClick={() => declineRequest(req)}
                              disabled={actionLoading === req.reqId}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {outgoing.length > 0 && (
                  <>
                    <h3 className="bdy-section-title">Sent</h3>
                    <div className="bdy-list">
                      {outgoing.map(req => (
                        <div key={req.reqId} className="bdy-card">
                          <div className="bdy-avatar">
                            {req.toClient?.photoURL ? (
                              <img src={req.toClient.photoURL} alt={req.toClient.name} />
                            ) : (
                              <span>{getInitials(req.toClient?.name)}</span>
                            )}
                          </div>
                          <div className="bdy-card-info">
                            <span className="bdy-card-name">{req.toClient?.name}</span>
                            <span className="bdy-card-sub">pending</span>
                          </div>
                          <button
                            className="bdy-cancel-btn"
                            onClick={() => cancelRequest(req)}
                            disabled={actionLoading === req.reqId}
                          >
                            {actionLoading === req.reqId ? <div className="bdy-btn-spinner" /> : 'Cancel'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {incoming.length === 0 && outgoing.length === 0 && (
                  <div className="bdy-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                    <h3>No pending requests</h3>
                    <p>All caught up!</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Search ── */}
            {tab === 'search' && (
              <div className="bdy-section">
                <div className="bdy-search-bar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                  {searchTerm && (
                    <button className="bdy-search-clear" onClick={() => setSearchTerm('')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>

                {searchTerm.trim() && searchResults.length === 0 && (
                  <div className="bdy-empty bdy-empty-sm">
                    <p>No members found for "{searchTerm}"</p>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="bdy-list">
                    {searchResults.map(c => (
                      <div key={c.id} className="bdy-card" onClick={() => navigate(`/client/core-buddy/profile/${c.id}`)}>
                        <div className="bdy-avatar">
                          {c.photoURL ? (
                            <img src={c.photoURL} alt={c.name} />
                          ) : (
                            <span>{getInitials(c.name)}</span>
                          )}
                        </div>
                        <div className="bdy-card-info">
                          <span className="bdy-card-name">{c.name}</span>
                          {c.isBuddy && <span className="bdy-card-badge">Buddy</span>}
                        </div>
                        {c.isBuddy ? (
                          <span className="bdy-status-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
                          </span>
                        ) : c.isPendingOut ? (
                          <span className="bdy-pending-label">Pending</span>
                        ) : c.isPendingIn ? (
                          <button
                            className="bdy-accept-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const req = incoming.find(r => r.fromId === c.id);
                              if (req) acceptRequest(req);
                            }}
                            disabled={!!actionLoading}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                          </button>
                        ) : (
                          <button
                            className="bdy-add-btn"
                            onClick={(e) => { e.stopPropagation(); sendRequest(c.id); }}
                            disabled={actionLoading === c.id}
                          >
                            {actionLoading === c.id ? <div className="bdy-btn-spinner" /> : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <CoreBuddyNav active="buddies" />

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
    </PullToRefresh>
  );
}
