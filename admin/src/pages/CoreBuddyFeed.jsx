import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc,
  addDoc, updateDoc, orderBy, limit, increment, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import './CoreBuddyFeed.css';

function getInitials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
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

export default function CoreBuddyFeed() {
  const { currentUser, isClient, clientData, loading: authLoading } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const [likedPosts, setLikedPosts] = useState(new Set());
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentLoading, setCommentLoading] = useState({});
  const [toast, setToast] = useState(null);
  const textareaRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!authLoading && (!currentUser || !isClient)) navigate('/');
  }, [currentUser, isClient, authLoading, navigate]);

  // Load buddies + posts
  const fetchFeed = useCallback(async () => {
    if (!clientData) return;
    setLoading(true);
    try {
      const myId = clientData.id;

      // 1. Get buddy IDs
      const b1 = await getDocs(query(collection(db, 'buddies'), where('user1', '==', myId)));
      const b2 = await getDocs(query(collection(db, 'buddies'), where('user2', '==', myId)));
      const bIds = new Set();
      [...b1.docs, ...b2.docs].forEach(d => {
        const data = d.data();
        bIds.add(data.user1 === myId ? data.user2 : data.user1);
      });

      // 2. Build author list (self + buddies, max 30 for Firestore `in` query)
      const authorIds = [myId, ...Array.from(bIds)].slice(0, 30);

      // 3. Query posts
      let allPosts = [];
      if (authorIds.length > 0) {
        const postsSnap = await getDocs(
          query(
            collection(db, 'posts'),
            where('authorId', 'in', authorIds),
            orderBy('createdAt', 'desc'),
            limit(50)
          )
        );
        allPosts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      setPosts(allPosts);

      // 4. Check which posts I've liked (single query)
      const likesSnap = await getDocs(
        query(collection(db, 'postLikes'), where('userId', '==', myId))
      );
      setLikedPosts(new Set(likesSnap.docs.map(d => d.data().postId)));
    } catch (err) {
      console.error('Error loading feed:', err);
      showToast('Failed to load feed', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientData, showToast]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  // Create post
  const handlePost = async () => {
    if (!postText.trim() || posting || !clientData) return;
    setPosting(true);
    try {
      await addDoc(collection(db, 'posts'), {
        authorId: clientData.id,
        authorName: clientData.name || 'Unknown',
        authorPhotoURL: clientData.photoURL || null,
        content: postText.trim(),
        type: 'text',
        createdAt: serverTimestamp(),
        likeCount: 0,
        commentCount: 0
      });
      setPostText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      await fetchFeed();
      showToast('Posted!', 'success');
    } catch (err) {
      console.error('Error posting:', err);
      showToast(err?.message || 'Failed to post', 'error');
    } finally {
      setPosting(false);
    }
  };

  // Delete own post
  const deletePost = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setPosts(prev => prev.filter(p => p.id !== postId));
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

    // Optimistic update
    const newLiked = new Set(likedPosts);
    if (isLiked) newLiked.delete(postId); else newLiked.add(postId);
    setLikedPosts(newLiked);
    setPosts(prev => prev.map(p =>
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
      fetchFeed();
    }
  };

  // Load comments for a post
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

  // Toggle comments visibility
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

  // Add comment
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
      setPosts(prev => prev.map(p =>
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
  const handleTextareaInput = (e) => {
    setPostText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  if (authLoading) {
    return <div className="feed-loading" data-theme={isDark ? 'dark' : 'light'}><div className="feed-spinner" /></div>;
  }
  if (!currentUser || !isClient || !clientData) return null;

  return (
    <div className="feed-page" data-theme={isDark ? 'dark' : 'light'}>
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

      <main className="feed-main">
        <h1 className="feed-title">Feed</h1>

        {/* Compose */}
        <div className="feed-compose">
          <div className="feed-compose-avatar">
            {clientData.photoURL ? (
              <img src={clientData.photoURL} alt="" />
            ) : (
              <span>{getInitials(clientData.name)}</span>
            )}
          </div>
          <div className="feed-compose-body">
            <textarea
              ref={textareaRef}
              placeholder="Share an update with your buddies..."
              value={postText}
              onChange={handleTextareaInput}
              rows={1}
              maxLength={500}
            />
            {postText.trim() && (
              <button
                className="feed-post-btn"
                onClick={handlePost}
                disabled={posting}
              >
                {posting ? <div className="feed-btn-spinner" /> : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="feed-content-loading"><div className="feed-spinner" /></div>
        ) : posts.length === 0 ? (
          <div className="feed-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <h3>No posts yet</h3>
            <p>Share an update or add buddies to see their posts here!</p>
          </div>
        ) : (
          <div className="feed-list">
            {posts.map(post => (
              <div key={post.id} className="feed-post">
                <div className="feed-post-header">
                  <div className="feed-post-avatar" onClick={() => navigate(`/client/core-buddy/profile/${post.authorId}`)}>
                    {post.authorPhotoURL ? (
                      <img src={post.authorPhotoURL} alt="" />
                    ) : (
                      <span>{getInitials(post.authorName)}</span>
                    )}
                  </div>
                  <div className="feed-post-meta" onClick={() => navigate(`/client/core-buddy/profile/${post.authorId}`)}>
                    <span className="feed-post-name">{post.authorName}</span>
                    <span className="feed-post-time">{timeAgo(post.createdAt)}</span>
                  </div>
                  {post.authorId === clientData.id && (
                    <button className="feed-delete-btn" onClick={() => deletePost(post.id)} aria-label="Delete post">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  )}
                </div>

                {post.content && <p className="feed-post-content">{post.content}</p>}

                {post.imageURL && (
                  <div className="feed-post-image">
                    <img src={post.imageURL} alt="Post" loading="lazy" />
                  </div>
                )}

                <div className="feed-post-actions">
                  <button
                    className={`feed-action-btn${likedPosts.has(post.id) ? ' liked' : ''}`}
                    onClick={() => toggleLike(post.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={likedPosts.has(post.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    <span>{post.likeCount || 0}</span>
                  </button>
                  <button
                    className={`feed-action-btn${expandedComments.has(post.id) ? ' active' : ''}`}
                    onClick={() => toggleComments(post.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>{post.commentCount || 0}</span>
                  </button>
                </div>

                {/* Comments Section */}
                {expandedComments.has(post.id) && (
                  <div className="feed-comments">
                    {comments[post.id]?.length > 0 ? (
                      comments[post.id].map(c => (
                        <div key={c.id} className="feed-comment">
                          <div className="feed-comment-avatar" onClick={() => navigate(`/client/core-buddy/profile/${c.authorId}`)}>
                            {c.authorPhotoURL ? (
                              <img src={c.authorPhotoURL} alt="" />
                            ) : (
                              <span>{getInitials(c.authorName)}</span>
                            )}
                          </div>
                          <div className="feed-comment-body">
                            <div className="feed-comment-bubble">
                              <span className="feed-comment-name">{c.authorName}</span>
                              <span className="feed-comment-text">{c.content}</span>
                            </div>
                            <span className="feed-comment-time">{timeAgo(c.createdAt)}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="feed-no-comments">No comments yet</p>
                    )}

                    <div className="feed-comment-input">
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
                          <div className="feed-btn-spinner-sm" />
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
