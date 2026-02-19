import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import CoreBuddyNav from '../components/CoreBuddyNav';
import PullToRefresh from '../components/PullToRefresh';
import { TICKS_85_96 } from '../utils/ringTicks';
import './CoreBuddyBuilder.css';

const TAGLINES = [
  { text: 'Build your dashboard...', bold: 'your way' },
  { text: 'Pick what matters to you...', bold: 'nothing else' },
  { text: 'Your goals, your layout...', bold: 'your rules' },
];

/** Widget definitions — what's available to pick from */
const WIDGET_DEFS = [
  { id: 'stats', label: 'Stats Rings', desc: 'Programme %, workouts this week, habits today', icon: 'rings', defaultOn: true },
  { id: 'workouts', label: 'Workouts', desc: 'Sessions this week and total count', icon: 'dumbbell', defaultOn: true },
  { id: 'habits', label: 'Habits', desc: 'Daily habit tracker dots', icon: 'check', defaultOn: true },
  { id: 'pbs', label: 'Personal Bests', desc: 'Your top lifts at a glance', icon: 'trophy' },
  { id: 'nutrition', label: 'Nutrition', desc: 'Macro rings — protein, carbs, fats, cals', icon: 'apple' },
  { id: 'leaderboard', label: 'Leaderboard', desc: 'See where you rank among buddies', icon: 'podium' },

  { id: 'journey', label: 'Journey', desc: 'Your posts, likes and comments feed', icon: 'feed' },
  { id: 'coach', label: 'Coach Message', desc: 'Motivational nudge from Buddy', icon: 'message', defaultOn: true },
  { id: 'nudge', label: 'Smart Nudge', desc: 'Contextual reminder of what to do next', icon: 'lightbulb' },
];

function widgetIcon(icon) {
  switch (icon) {
    case 'rings': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
    case 'dumbbell': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.5 6.5h11v11h-11z" strokeLinejoin="round"/><line x1="2" y1="12" x2="6.5" y2="12"/><line x1="17.5" y1="12" x2="22" y2="12"/></svg>;
    case 'check': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
    case 'trophy': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H3V6a1 1 0 0 1 1-1h2M18 9h3V6a1 1 0 0 0-1-1h-2"/><path d="M6 5h12v7a6 6 0 0 1-12 0V5z"/><path d="M9 21h6"/><path d="M12 17v4"/></svg>;
    case 'apple': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3c-1.5 0-3 1-3 1s-3-.5-4.5 1.5S3 9 3 12s1.5 6 3 8 3 3 6 3 4.5-1 6-3 3-5 3-8-1.5-4-3-6.5S13.5 3 12 3z"/><path d="M12 3c0 0 1-2 3-2"/></svg>;
    case 'podium': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="14" width="6" height="8" rx="1"/><rect x="9" y="8" width="6" height="14" rx="1"/><rect x="16" y="11" width="6" height="11" rx="1"/></svg>;
    case 'medal': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="15" r="6"/><path d="M8.21 13.89L7 2h10l-1.21 11.89"/></svg>;
    case 'feed': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>;
    case 'message': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
    case 'lightbulb': return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>;
    default: return null;
  }
}

export default function CoreBuddyBuilder() {
  const navigate = useNavigate();
  const { clientData, currentUser, updateClientData, resolveClient } = useAuth();

  // Timer state
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [ticksElapsed, setTicksElapsed] = useState(0);
  const [taglineIdx, setTaglineIdx] = useState(0);

  // Profile photo
  const [photoURL, setPhotoURL] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);

  // Widget selection
  const [widgets, setWidgets] = useState(() => {
    // Load saved config or use defaults
    const saved = clientData?.dashboardWidgets;
    if (saved && Array.isArray(saved)) return saved;
    return WIDGET_DEFS.filter(w => w.defaultOn).map(w => w.id);
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Load photo from client data
  useEffect(() => {
    if (clientData?.photoURL) setPhotoURL(clientData.photoURL);
  }, [clientData?.photoURL]);

  // 24hr countdown
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      const diff = end - now;
      setTimeLeft({
        hours: Math.floor(diff / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
      setTicksElapsed(60 - Math.floor((diff % 60000) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Rotating taglines
  useEffect(() => {
    const id = setInterval(() => setTaglineIdx(p => (p + 1) % TAGLINES.length), 8000);
    return () => clearInterval(id);
  }, []);

  // Photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !clientData?.id) return;
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `profilePhotos/${clientData.id}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'clients', clientData.id), { photoURL: url });
      setPhotoURL(url);
      updateClientData({ photoURL: url });
    } catch (err) {
      console.error('Photo upload error:', err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Toggle widget
  const toggleWidget = (id) => {
    setSaved(false);
    setWidgets(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  // Move widget up/down
  const moveWidget = (id, dir) => {
    setSaved(false);
    setWidgets(prev => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  // Save config
  const saveConfig = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Resolve client if not loaded yet
      const client = clientData || await resolveClient();
      if (!client?.id) {
        setSaveError('Could not find your profile. Try refreshing.');
        setSaving(false);
        return;
      }
      await updateDoc(doc(db, 'clients', client.id), {
        dashboardWidgets: widgets,
      });
      updateClientData({ dashboardWidgets: widgets });
      setSaved(true);
    } catch (err) {
      console.error('Save config error:', err);
      setSaveError('Save failed — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PullToRefresh>
    <div className="bldr-page">
      <div className="bldr-container">
        {/* Header */}
        <div className="bldr-header">
          <button className="bldr-back" onClick={() => navigate('/client/core-buddy')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="bldr-title">Build Your Dashboard</h1>
        </div>

        {/* ── Countdown Ring + Profile Photo ── */}
        <div className="bldr-ring-container">
          <div className="bldr-ring">
            <svg className="bldr-ring-svg" viewBox="0 0 200 200">
              {TICKS_85_96.map((t, i) => (
                <line
                  key={i}
                  x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
                  className={`bldr-tick ${i < ticksElapsed ? 'elapsed' : 'remaining'}`}
                  strokeWidth={t.thick ? '3' : '2'}
                />
              ))}
            </svg>

            <div className="bldr-ring-center">
              <div className="bldr-ring-photo" onClick={() => photoInputRef.current?.click()}>
                <img
                  src={photoURL || '/Logo.webp'}
                  alt={photoURL ? 'Profile' : 'Mind Core Fitness'}
                />
                <div className={`bldr-photo-overlay${uploadingPhoto ? ' uploading' : ''}`}>
                  {uploadingPhoto ? (
                    <div className="bldr-photo-spinner" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  )}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
              </div>
              {!photoURL && !uploadingPhoto && (
                <div className="bldr-photo-badge" onClick={() => photoInputRef.current?.click()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              )}
            </div>
          </div>

          <div className="bldr-countdown">
            <span className="bldr-timer-digit">{String(timeLeft.hours).padStart(2, '0')}</span>
            <span className="bldr-timer-colon">:</span>
            <span className="bldr-timer-digit">{String(timeLeft.minutes).padStart(2, '0')}</span>
            <span className="bldr-timer-colon">:</span>
            <span className="bldr-timer-digit bldr-timer-sec">{String(timeLeft.seconds).padStart(2, '0')}</span>
          </div>
          <span className="bldr-ring-label">remaining today</span>
          <p className="bldr-tagline">{TAGLINES[taglineIdx].text} <strong>{TAGLINES[taglineIdx].bold}</strong></p>
        </div>

        {/* ── Widget Picker ── */}
        <div className="bldr-section">
          <h2 className="bldr-section-title">Choose Your Widgets</h2>
          <p className="bldr-section-desc">
            The countdown ring and your profile always stay at the top. Pick what goes below.
          </p>

          <div className="bldr-widgets-list">
            {WIDGET_DEFS.map(w => {
              const isOn = widgets.includes(w.id);
              const idx = widgets.indexOf(w.id);
              return (
                <div key={w.id} className={`bldr-widget-card${isOn ? ' active' : ''}`}>
                  <div className="bldr-widget-icon">{widgetIcon(w.icon)}</div>
                  <div className="bldr-widget-info">
                    <div className="bldr-widget-label">
                      {w.label}
                    </div>
                    <div className="bldr-widget-desc">{w.desc}</div>
                  </div>
                  <div className="bldr-widget-actions">
                    {isOn && (
                      <div className="bldr-widget-order">
                        <button
                          className="bldr-order-btn"
                          onClick={() => moveWidget(w.id, -1)}
                          disabled={idx === 0}
                          aria-label="Move up"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 15l-6-6-6 6"/></svg>
                        </button>
                        <span className="bldr-order-num">{idx + 1}</span>
                        <button
                          className="bldr-order-btn"
                          onClick={() => moveWidget(w.id, 1)}
                          disabled={idx === widgets.length - 1}
                          aria-label="Move down"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                        </button>
                      </div>
                    )}
                    <button
                      className={`bldr-toggle${isOn ? ' on' : ''}`}
                      onClick={() => toggleWidget(w.id)}
                      aria-label={isOn ? `Remove ${w.label}` : `Add ${w.label}`}
                    >
                      <div className="bldr-toggle-thumb" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Save Button ── */}
        <div className="bldr-save-wrap">
          <button
            className={`bldr-save-btn${saved ? ' saved' : ''}`}
            onClick={saveConfig}
            disabled={saving || saved}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Dashboard'}
          </button>
          {saveError && <p className="bldr-save-error">{saveError}</p>}
          {saved && (
            <button className="bldr-view-btn" onClick={() => navigate('/client/core-buddy')}>
              View Dashboard
            </button>
          )}
        </div>
      </div>

      <CoreBuddyNav active="home" />
    </div>
    </PullToRefresh>
  );
}
