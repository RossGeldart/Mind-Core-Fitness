import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, where, limit, writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import './AdminCoreBuddy.css';

export default function AdminCoreBuddy() {
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [ratedWorkouts, setRatedWorkouts] = useState([]);
  const [loadingRatings, setLoadingRatings] = useState(true);
  const [customExercises, setCustomExercises] = useState([]);
  const [loadingCustom, setLoadingCustom] = useState(true);
  const [clientNames, setClientNames] = useState({});
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const fileRef = useRef(null);
  const authChecked = useRef(false);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Only redirect once after the initial auth check — not on every re-render
  useEffect(() => {
    if (authLoading || authChecked.current) return;
    if (!currentUser || !isAdmin) {
      navigate('/', { replace: true });
    } else {
      authChecked.current = true;
    }
  }, [currentUser, isAdmin, authLoading, navigate]);

  const fetchAnnouncements = useCallback(async () => {
    setLoadingAnnouncements(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))
      );
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching announcements:', err);
    } finally {
      setLoadingAnnouncements(false);
    }
  }, []);

  const fetchRatedWorkouts = useCallback(async () => {
    setLoadingRatings(true);
    try {
      const q = query(
        collection(db, 'workoutLogs'),
        where('feelingRating', '>', 0),
        orderBy('feelingRating'),
        orderBy('completedAt', 'desc'),
        limit(30)
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by completedAt desc (since Firestore requires feelingRating as first orderBy)
      logs.sort((a, b) => {
        const aT = a.completedAt?.toMillis?.() || 0;
        const bT = b.completedAt?.toMillis?.() || 0;
        return bT - aT;
      });
      setRatedWorkouts(logs);

      // Fetch client names for all unique clientIds
      const ids = [...new Set(logs.map(l => l.clientId).filter(Boolean))];
      if (ids.length > 0) {
        const names = {};
        // Batch fetch in groups of 10 (Firestore 'in' query limit)
        for (let i = 0; i < ids.length; i += 10) {
          const batch = ids.slice(i, i + 10);
          const clientSnap = await getDocs(
            query(collection(db, 'clients'), where('__name__', 'in', batch))
          );
          clientSnap.docs.forEach(d => { names[d.id] = d.data().name || d.data().email || d.id; });
        }
        setClientNames(prev => ({ ...prev, ...names }));
      }
    } catch (err) {
      console.error('Error fetching rated workouts:', err);
    } finally {
      setLoadingRatings(false);
    }
  }, []);

  const fetchCustomExercises = useCallback(async () => {
    setLoadingCustom(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'userCustomExercises'), orderBy('createdAt', 'desc'))
      );
      const exercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomExercises(exercises);
      // Fetch client names for any new clientIds
      const ids = [...new Set(exercises.map(e => e.clientId).filter(Boolean))];
      if (ids.length > 0) {
        const names = {};
        for (let i = 0; i < ids.length; i += 10) {
          const batch = ids.slice(i, i + 10);
          const clientSnap = await getDocs(
            query(collection(db, 'clients'), where('__name__', 'in', batch))
          );
          clientSnap.docs.forEach(d => { names[d.id] = d.data().name || d.data().email || d.id; });
        }
        setClientNames(prev => ({ ...prev, ...names }));
      }
    } catch (err) {
      console.error('Error fetching custom exercises:', err);
    } finally {
      setLoadingCustom(false);
    }
  }, []);

  const handleDeleteCustomExercise = async (id) => {
    if (!window.confirm('Delete this custom exercise?')) return;
    try {
      await deleteDoc(doc(db, 'userCustomExercises', id));
      setCustomExercises(prev => prev.filter(e => e.id !== id));
      showToast('Custom exercise deleted', 'info');
    } catch (err) {
      console.error('Error deleting custom exercise:', err);
      showToast('Failed to delete', 'error');
    }
  };

  const handleApproveExercise = async (ex) => {
    try {
      await addDoc(collection(db, 'approvedExercises'), {
        name: ex.name,
        type: ex.type,
        equipment: ex.equipment || 'custom',
        group: ex.group || 'upper',
        muscle: ex.muscle || 'chest',
        approvedAt: serverTimestamp(),
        submittedBy: ex.clientId || null,
      });
      // Remove from user custom exercises
      await deleteDoc(doc(db, 'userCustomExercises', ex.id));
      setCustomExercises(prev => prev.filter(e => e.id !== ex.id));
      showToast(`"${ex.name}" approved and added to library`, 'success');
    } catch (err) {
      console.error('Error approving exercise:', err);
      showToast('Failed to approve', 'error');
    }
  };

  useEffect(() => {
    if (currentUser && isAdmin) {
      fetchAnnouncements();
      fetchRatedWorkouts();
      fetchCustomExercises();
    }
  }, [currentUser, isAdmin, fetchAnnouncements, fetchRatedWorkouts, fetchCustomExercises]);

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePost = async () => {
    if (!title.trim()) { showToast('Title is required', 'error'); return; }
    if (!content.trim()) { showToast('Content is required', 'error'); return; }
    setPosting(true);
    try {
      let imageURL = null;
      if (imageFile) {
        const imgRef = ref(storage, `announcements/${Date.now()}_${imageFile.name}`);
        await uploadBytes(imgRef, imageFile);
        imageURL = await getDownloadURL(imgRef);
      }
      const announcementTitle = title.trim();
      const announcementContent = content.trim();
      await addDoc(collection(db, 'announcements'), {
        title: announcementTitle,
        content: announcementContent,
        imageURL,
        authorId: currentUser.uid,
        authorName: 'Mind Core Fitness',
        createdAt: serverTimestamp()
      });

      setTitle('');
      setContent('');
      clearImage();
      showToast('Announcement posted', 'success');
      await fetchAnnouncements();

      // Notify all clients in the background (fire-and-forget)
      (async () => {
        try {
          const clientsSnap = await getDocs(collection(db, 'clients'));
          const clients = clientsSnap.docs.filter(d => d.data().uid !== currentUser.uid);
          for (let i = 0; i < clients.length; i += 499) {
            const batch = writeBatch(db);
            clients.slice(i, i + 499).forEach(clientDoc => {
              const notifRef = doc(collection(db, 'notifications'));
              batch.set(notifRef, {
                toId: clientDoc.id,
                fromId: 'system',
                fromName: 'Mind Core Fitness',
                type: 'announcement',
                title: 'New Announcement',
                body: announcementTitle,
                read: false,
                createdAt: serverTimestamp()
              });
            });
            await batch.commit();
          }
        } catch (notifErr) {
          console.error('Failed to send announcement notifications:', notifErr);
        }
      })();
    } catch (err) {
      console.error('Error posting announcement:', err);
      showToast('Failed to post announcement', 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'announcements', id));
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      showToast('Announcement deleted', 'info');
    } catch (err) {
      console.error('Error deleting announcement:', err);
      showToast('Failed to delete', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (authLoading) return <div className="acb-loading"><div className="acb-spinner" /></div>;
  if (!currentUser || !isAdmin) return null;

  return (
    <div className="acb-page">
      <header className="acb-header">
        <button className="acb-back-btn" onClick={() => navigate('/dashboard')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h1>Core Buddy Admin</h1>
      </header>

      <main className="acb-main">
        {/* Workout Ratings */}
        <section className="acb-ratings-section">
          <h2>Recent Workout Ratings</h2>
          {loadingRatings ? (
            <div className="acb-content-loading"><div className="acb-spinner" /></div>
          ) : ratedWorkouts.length === 0 ? (
            <div className="acb-empty">
              <p>No rated workouts yet</p>
            </div>
          ) : (
            <div className="acb-ratings-list">
              {ratedWorkouts.map(w => {
                const feeling = ['', '\u{1F635}', '\u{1F624}', '\u{1F60A}', '\u{1F4AA}', '\u{1F525}'][w.feelingRating] || '';
                const feelingLabel = ['', 'Tough', 'Hard', 'Good', 'Great', 'Amazing'][w.feelingRating] || '';
                const date = w.completedAt?.toDate ? w.completedAt.toDate() : null;
                const workoutType = w.type === 'custom_sets' ? 'Build Your Own' : `${(w.focus || '').replace(/^\w/, c => c.toUpperCase())} ${w.duration || ''}min`;
                return (
                  <div key={w.id} className="acb-rating-card">
                    <span className="acb-rating-emoji">{feeling}</span>
                    <div className="acb-rating-info">
                      <span className="acb-rating-name">{clientNames[w.clientId] || 'Client'}</span>
                      <span className="acb-rating-detail">
                        {workoutType} &mdash; felt <strong>{feelingLabel}</strong>
                      </span>
                    </div>
                    <span className="acb-rating-date">
                      {date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Custom Exercises */}
        <section className="acb-ratings-section">
          <h2>User Custom Exercises</h2>
          {loadingCustom ? (
            <div className="acb-content-loading"><div className="acb-spinner" /></div>
          ) : customExercises.length === 0 ? (
            <div className="acb-empty">
              <p>No custom exercises created yet</p>
            </div>
          ) : (
            <div className="acb-ratings-list">
              {customExercises.map(ex => {
                const muscleLabels = {
                  chest: 'Chest', back: 'Back', biceps: 'Biceps', triceps: 'Triceps',
                  shoulders: 'Shoulders', quads: 'Squats', lunges: 'Lunges', glutes: 'Glutes',
                  calves: 'Calves', planks_holds: 'Planks & Holds', twists: 'Twists',
                  crunches_raises: 'Crunches & Raises', custom: 'Uncategorised',
                };
                const groupLabels = { upper: 'Upper', lower: 'Lower', core: 'Core', custom: 'Custom' };
                const date = ex.createdAt?.toDate ? ex.createdAt.toDate() : null;
                return (
                  <div key={ex.id} className="acb-rating-card">
                    <div className="acb-custom-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </div>
                    <div className="acb-rating-info" style={{ flex: 1 }}>
                      <span className="acb-rating-name">{ex.name}</span>
                      <span className="acb-rating-detail">
                        {clientNames[ex.clientId] || 'Client'} &mdash; {groupLabels[ex.group] || 'Custom'} &middot; {muscleLabels[ex.muscle] || muscleLabels[ex.group] || 'Custom'} &middot; {ex.type}
                      </span>
                    </div>
                    <span className="acb-rating-date">
                      {date ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                    <div className="acb-custom-actions">
                      <button
                        className="acb-approve-btn"
                        onClick={() => handleApproveExercise(ex)}
                        aria-label="Approve exercise"
                        title="Approve for all users"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                      </button>
                      <button
                        className="acb-delete-btn"
                        onClick={() => handleDeleteCustomExercise(ex.id)}
                        aria-label="Delete custom exercise"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Create Announcement */}
        <section className="acb-create">
          <h2>New Announcement</h2>
          <div className="acb-form">
            <input
              type="text"
              className="acb-input"
              placeholder="Announcement title..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={120}
            />
            <textarea
              className="acb-textarea"
              placeholder="Write your announcement..."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              maxLength={2000}
            />
            <div className="acb-image-row">
              <button className="acb-img-btn" onClick={() => fileRef.current?.click()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span>{imageFile ? 'Change Image' : 'Add Image'}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageSelect} hidden />
              {imagePreview && (
                <div className="acb-img-preview">
                  <img src={imagePreview} alt="Preview" />
                  <button className="acb-img-remove" onClick={clearImage}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                  </button>
                </div>
              )}
            </div>
            <button
              className="acb-post-btn"
              onClick={handlePost}
              disabled={posting || !title.trim() || !content.trim()}
            >
              {posting ? <div className="acb-btn-spinner" /> : 'Post Announcement'}
            </button>
          </div>
        </section>

        {/* Announcements List */}
        <section className="acb-list-section">
          <h2>Announcements</h2>
          {loadingAnnouncements ? (
            <div className="acb-content-loading"><div className="acb-spinner" /></div>
          ) : announcements.length === 0 ? (
            <div className="acb-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
              <p>No announcements yet</p>
            </div>
          ) : (
            <div className="acb-announcements-list">
              {announcements.map(a => (
                <div key={a.id} className="acb-announcement-card">
                  <div className="acb-announcement-top">
                    <div className="acb-announcement-info">
                      <h3>{a.title}</h3>
                      <span className="acb-announcement-date">{formatDate(a.createdAt)}</span>
                    </div>
                    <button
                      className="acb-delete-btn"
                      onClick={() => handleDelete(a.id)}
                      disabled={deletingId === a.id}
                      aria-label="Delete announcement"
                    >
                      {deletingId === a.id ? (
                        <div className="acb-btn-spinner" />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      )}
                    </button>
                  </div>
                  <p className="acb-announcement-content">{a.content}</p>
                  {a.imageURL && (
                    <div className="acb-announcement-image">
                      <img src={a.imageURL} alt="" loading="lazy" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {toast && (
        <div className="acb-toast-container">
          <div className={`acb-toast ${toast.type}`}>
            <span className="acb-toast-icon">
              {toast.type === 'success' && (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              )}
              {toast.type === 'error' && (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              )}
              {toast.type === 'info' && (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
              )}
            </span>
            <span className="acb-toast-message">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
